import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { deepEqual, queryDb } from "@livestore/livestore";
import { Effect, Option, Stream } from "effect";
import { onCleanup, onMount, Show } from "solid-js";
import TextEditor from "./TextEditor";

interface TitleProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

export default function Title({ bufferId, nodeId }: TitleProps) {
  const runtime = useBrowserRuntime();

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
        Stream.map((buffer): { anchor: number; head: number; goalX: number | null; goalLine: "first" | "last" | null } | null => {
          if (!buffer?.selection) return null;

          const sel = buffer.selection;
          // Title uses bufferId as anchorBlockId (hack)
          if (sel.anchorBlockId !== (bufferId as unknown as Id.Block)) {
            return null;
          }

          return {
            anchor: sel.anchorOffset,
            head: sel.focusOffset,
            goalX: sel.goalX ?? null,
            goalLine: sel.goalLine ?? null,
          };
        }),
        Stream.changesWith(deepEqual),
      );

      return Stream.zipLatestWith(
        Stream.zipLatest(nodeStream, isActiveStream),
        selectionStream,
        ([nodeData, isActive], selection) => ({
          textContent: nodeData.textContent,
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
      textContent: "",
      isActive: false,
      selection: null as { anchor: number; head: number; goalX: number | null; goalLine: "first" | "last" | null } | null,
    },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(dispose);
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

  const handleTextChange = (text: string) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        yield* Node.setNodeText(nodeId, text);
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
            anchorBlockId: targetBlockId,
            anchorOffset: 0,
            focusBlockId: targetBlockId,
            focusOffset: 0,
            goalX: null,
            goalLine: null,
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

        const firstChildId = children[0]!;
        const targetBlockId = Id.makeBlockId(bufferId, firstChildId);

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchorBlockId: targetBlockId,
            anchorOffset: 0,
            focusBlockId: targetBlockId,
            focusOffset: 0,
            goalX: cursorGoalX,
            goalLine: "first",
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  return (
    <div data-element-id={bufferId} data-element-type="title" onClick={handleFocus}>
      <Show
        when={store.isActive}
        fallback={
          <h1 class="text-title leading-[var(--text-title--line-height)] font-semibold">
            {store.textContent}
          </h1>
        }
      >
        <TextEditor
          initialText={store.textContent}
          onChange={handleTextChange}
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
