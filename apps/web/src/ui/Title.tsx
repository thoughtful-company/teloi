import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { deepEqual, queryDb } from "@livestore/livestore";
import { Effect, Option, Stream } from "effect";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import TextEditor, { EnterKeyInfo } from "./TextEditor";

interface TitleProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

/**
 * Render and manage an editable title for a buffer node.
 *
 * Synchronizes the displayed text with a Yjs text object, switches between a read-only heading
 * and an interactive TextEditor when the title becomes active, and handles focus and keyboard
 * navigation (ArrowRight at end, ArrowDown on last line, Enter to split/create a child node).
 *
 * @param bufferId - Identifier of the buffer that contains the node
 * @param nodeId - Identifier of the node whose title is rendered and edited
 * @returns A JSX element that shows the title as an editable TextEditor when active, or as a static <h1> otherwise
 */
export default function Title({ bufferId, nodeId }: TitleProps) {
  const runtime = useBrowserRuntime();

  // Get Y.Text and UndoManager for the title node
  const Yjs = runtime.runSync(YjsT);
  const ytext = Yjs.getText(nodeId);
  const undoManager = Yjs.getUndoManager(nodeId);

  // Reactive text content signal for unfocused view
  const [textContent, setTextContent] = createSignal(ytext.toString());

  const titleStream = Stream.unwrap(
    Effect.gen(function* () {
      const Node = yield* NodeT;
      const Window = yield* WindowT;
      const Store = yield* StoreT;

      const nodeStream = yield* Node.subscribe(nodeId);
      const activeElementStream = yield* Window.subscribeActiveElement();

      const isActiveStream = activeElementStream.pipe(
        Stream.map((maybeActive) =>
          Option.match(maybeActive, {
            onNone: () => false,
            onSome: (el) =>
              el.type === "title" && el.bufferId === bufferId,
          }),
        ),
        Stream.changesWith((a, b) => a === b),
      );

      const query = queryDb(
        tables.buffer
          .select("value")
          .where("id", "=", bufferId)
          .first({ fallback: () => null }),
      );
      const bufferStream = yield* Store.subscribeStream(query).pipe(
        Effect.orDie,
      );

      const selectionStream = bufferStream.pipe(
        Stream.map((buffer): { anchor: number; head: number; goalX: number | null; goalLine: "first" | "last" | null; assoc: -1 | 1 | null } | null => {
          if (!buffer?.selection) return null;

          const sel = buffer.selection;
          // Only return selection if anchor is on this node (the title's node)
          if (sel.anchor.nodeId !== nodeId) {
            return null;
          }

          return {
            anchor: sel.anchorOffset,
            head: sel.focusOffset,
            goalX: sel.goalX ?? null,
            goalLine: sel.goalLine ?? null,
            assoc: sel.assoc ?? null,
          };
        }),
        Stream.changesWith(deepEqual),
      );

      return Stream.zipLatestWith(
        Stream.zipLatest(nodeStream, isActiveStream),
        selectionStream,
        ([, isActive], selection) => ({
          isActive,
          selection,
        }),
      );
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: titleStream,
    project: (v) => v,
    initial: {
      isActive: false,
      selection: null as { anchor: number; head: number; goalX: number | null; goalLine: "first" | "last" | null; assoc: -1 | 1 | null } | null,
    },
  });

  onMount(() => {
    const dispose = start(runtime);

    // Observe Y.Text changes for unfocused view
    const observer = () => setTextContent(ytext.toString());
    ytext.observe(observer);

    onCleanup(() => {
      dispose();
      ytext.unobserve(observer);
    });
  });

  let clickCoords: { x: number; y: number } | null = null;

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        yield* Window.setActiveElement(
          Option.some({ type: "title" as const, bufferId }),
        );
      }),
    );
  };

  const handleBlur = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        const Store = yield* StoreT;

        // Only clear if activeElement still points to this title.
        // If navigating to a block, activeElement already points there - don't clear.
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);
        const windowDoc = yield* Store.getDocument("window", windowId);

        if (Option.isNone(windowDoc)) return;

        const active = windowDoc.value.activeElement;
        if (active && active.type === "title" && active.bufferId === bufferId) {
          yield* Window.setActiveElement(Option.none());
        }
      }),
    );
  };

  const handleArrowRightAtEnd = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length === 0) return;

        const firstChildId = children[0]!;
        const targetBlockId = Id.makeBlockId(bufferId, firstChildId);

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: firstChildId },
            anchorOffset: 0,
            focus: { nodeId: firstChildId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: null,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  const handleArrowDownOnLastLine = (cursorGoalX: number) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length === 0) return;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX = Option.isSome(existingSelection) && existingSelection.value.goalX != null
          ? existingSelection.value.goalX
          : cursorGoalX;

        const firstChildId = children[0]!;
        const targetBlockId = Id.makeBlockId(bufferId, firstChildId);

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: firstChildId },
            anchorOffset: 0,
            focus: { nodeId: firstChildId },
            focusOffset: 0,
            goalX,
            goalLine: "first",
            assoc: null,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  const handleEnter = (info: EnterKeyInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Create new node as first child
        const newNodeId = yield* Node.insertNode({
          parentId: nodeId,
          insert: "before",
        });

        // Update Y.Text: title keeps text before cursor, new block gets text after
        ytext.delete(info.cursorPos, ytext.length - info.cursorPos);
        const newYtext = Yjs.getText(newNodeId);
        newYtext.insert(0, info.textAfter);

        const newBlockId = Id.makeBlockId(bufferId, newNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: newNodeId },
            anchorOffset: 0,
            focus: { nodeId: newNodeId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: null,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: newBlockId }),
        );
      }),
    );
  };

  return (
    <div data-element-id={bufferId} data-element-type="title" onClick={handleFocus} class="min-h-[var(--text-title--line-height)]">
      <Show
        when={store.isActive}
        fallback={
          <h1 class="text-title leading-[var(--text-title--line-height)] font-semibold">
            {textContent()}
          </h1>
        }
      >
        <TextEditor
          ytext={ytext}
          undoManager={undoManager}
          onEnter={handleEnter}
          onBlur={handleBlur}
          onArrowRightAtEnd={handleArrowRightAtEnd}
          onArrowDownOnLastLine={handleArrowDownOnLastLine}
          initialClickCoords={clickCoords}
          selection={store.selection}
          variant="title"
        />
      </Show>
    </div>
  );
}