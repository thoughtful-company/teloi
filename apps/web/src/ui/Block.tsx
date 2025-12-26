import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Option, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import TextEditor, { EnterKeyInfo, SelectionInfo } from "./TextEditor";

interface BlockProps {
  blockId: Id.Block;
}

export default function Block({ blockId }: BlockProps) {
  const runtime = useBrowserRuntime();

  // Lazy block creation: if block doesn't exist, create it then subscribe
  const blockStreamEffect = Effect.gen(function* () {
    const Block = yield* BlockT;
    const Store = yield* StoreT;

    return yield* Block.subscribe(blockId).pipe(
      Effect.catchTag("BlockNotFoundError", () =>
        Effect.gen(function* () {
          yield* Store.setDocument(
            "block",
            {
              isSelected: false,
              isToggled: false,
            },
            blockId,
          );

          return yield* Block.subscribe(blockId);
        }),
      ),
      Effect.catchTag("NodeNotFoundError", (err) =>
        Effect.dieMessage(err.toString()),
      ),
    );
  });

  const blockStream = Stream.unwrap(blockStreamEffect);

  const { store, start } = bindStreamToStore({
    stream: blockStream,
    project: (view) => ({
      textContent: view.nodeData.textContent,
      isActive: view.isActive,
      childBlockIds: view.childBlockIds,
      selection: view.selection,
    }),
    initial: {
      textContent: "",
      isActive: false,
      childBlockIds: [] as readonly Id.Block[],
      selection: null as { anchor: number; head: number } | null,
    },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(dispose);
  });

  let clickCoords: { x: number; y: number } | null = null;
  let initialSelection: { anchor: number; head: number } | null = null;

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    initialSelection = null;

    const domSelection = window.getSelection();
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      !domSelection.isCollapsed
    ) {
      const target = e.currentTarget as HTMLElement;
      const paragraph = target.querySelector("p");

      if (
        paragraph &&
        paragraph.contains(domSelection.anchorNode) &&
        paragraph.contains(domSelection.focusNode)
      ) {
        initialSelection = {
          anchor: domSelection.anchorOffset,
          head: domSelection.focusOffset,
        };
      }
    }

    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        );
      }),
    );
  };

  const handleTextChange = (text: string) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        yield* Node.setNodeText(nodeId, text);
      }),
    );
  };

  const handleSelectionChange = (selection: SelectionInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Buffer = yield* BufferT;
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchorBlockId: blockId,
            anchorOffset: selection.anchor,
            focusBlockId: blockId,
            focusOffset: selection.head,
          }),
        );
      }),
    );
  };

  const handleEnter = (info: EnterKeyInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;

        // Get parent of current node
        const parentId = yield* Node.getParent(nodeId);

        const isAtStart = info.cursorPos === 0 && info.textAfter.length > 0;

        const newNodeId = yield* Node.insertNode({
          parentId,
          insert: isAtStart ? "before" : "after",
          siblingId: nodeId,
          textContent: isAtStart ? "" : info.textAfter,
        });

        if (!isAtStart) {
          yield* Node.setNodeText(nodeId, info.textBefore);
        }

        const newBlockId = Id.makeBlockId(bufferId, newNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchorBlockId: newBlockId,
            anchorOffset: 0,
            focusBlockId: newBlockId,
            focusOffset: 0,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: newBlockId }),
        );
      }).pipe(
        Effect.catchTag(
          "NodeHasNoParentError",
          () =>
            // Root nodes can't be split - do nothing
            Effect.void,
        ),
      ),
    );
  };

  const handleTab = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;

        // Get parent of current node
        const parentId = yield* Node.getParent(nodeId);

        // Get siblings
        const siblings = yield* Node.getNodeChildren(parentId);
        const siblingIndex = siblings.indexOf(nodeId);

        // Can't indent first sibling - no previous sibling to indent into
        if (siblingIndex <= 0) {
          return;
        }

        const prevSiblingId = siblings[siblingIndex - 1]!;

        // Move this node to be a child of the previous sibling
        yield* Node.insertNode({
          nodeId, // Existing node - triggers move
          parentId: prevSiblingId, // New parent is previous sibling
          insert: "after", // Append at end of previous sibling's children
        });
      }).pipe(
        Effect.catchTag(
          "NodeHasNoParentError",
          () =>
            // Root nodes can't be indented - do nothing
            Effect.void,
        ),
      ),
    );
  };

  return (
    <div data-element-id={blockId} data-element-type="block">
      <div onClick={handleFocus}>
        <Show
          when={store.isActive}
          fallback={
            <p class="text-[length:var(--text-block)] leading-[var(--text-block--line-height)] min-h-[var(--text-block--line-height)]">
              {store.textContent || "\u00A0"}
            </p>
          }
        >
          <TextEditor
            initialText={store.textContent}
            onChange={handleTextChange}
            onEnter={handleEnter}
            onTab={handleTab}
            onSelectionChange={handleSelectionChange}
            initialClickCoords={clickCoords}
            initialSelection={initialSelection}
            selection={store.selection}
          />
        </Show>
      </div>
      <div class="pl-4">
        <For each={store.childBlockIds}>
          {(childId) => <Block blockId={childId} />}
        </For>
      </div>
    </div>
  );
}
