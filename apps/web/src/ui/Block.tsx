import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Option, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import TextEditor, { type EnterKeyInfo, type SelectionInfo } from "./TextEditor";

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
      selection: null as { anchor: number; head: number; goalX: number | null; goalLine: "first" | "last" | null; assoc: -1 | 1 | null } | null,
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
            goalX: null,
            goalLine: null,
            assoc: selection.assoc,
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
            goalX: null,
            goalLine: null,
            assoc: null,
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

  const handleShiftTab = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;

        const parentId = yield* Node.getParent(nodeId);

        const grandparentId = yield* Node.getParent(parentId);

        yield* Node.insertNode({
          nodeId,
          parentId: grandparentId,
          insert: "after",
          siblingId: parentId,
        });
      }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
    );
  };

  const handleBackspaceAtStart = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Get parent and siblings
        const parentId = yield* Node.getParent(nodeId);
        const siblings = yield* Node.getNodeChildren(parentId);
        const siblingIndex = siblings.indexOf(nodeId);

        // Can't merge if first sibling
        if (siblingIndex <= 0) {
          return;
        }

        const prevSiblingId = siblings[siblingIndex - 1]!;

        // Get text from both nodes
        const currentText = store.textContent;
        const prevNode = yield* Node.get(prevSiblingId);
        const prevText = prevNode.textContent;
        const mergePoint = prevText.length;

        // Update previous sibling with merged text
        yield* Node.setNodeText(prevSiblingId, prevText + currentText);

        // Delete current node
        yield* Store.commit(
          events.nodeDeleted({
            timestamp: Date.now(),
            data: { nodeId },
          }),
        );

        // Move focus to previous block at merge point
        const prevBlockId = Id.makeBlockId(bufferId, prevSiblingId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchorBlockId: prevBlockId,
            anchorOffset: mergePoint,
            focusBlockId: prevBlockId,
            focusOffset: mergePoint,
            goalX: null,
            goalLine: null,
            assoc: null,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: prevBlockId }),
        );
      }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
    );
  };

  const handleArrowLeftAtStart = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const parentId = yield* Node.getParent(nodeId);
        const siblings = yield* Node.getNodeChildren(parentId);
        const siblingIndex = siblings.indexOf(nodeId);

        const findDeepestLastChild = (
          startNodeId: Id.Node,
        ): Effect.Effect<Id.Node, never, NodeT> =>
          Effect.gen(function* () {
            const Node = yield* NodeT;
            const children = yield* Node.getNodeChildren(startNodeId);
            if (children.length === 0) {
              return startNodeId;
            }
            const lastChild = children[children.length - 1]!;
            return yield* findDeepestLastChild(lastChild);
          });

        if (siblingIndex > 0) {
          const prevSiblingId = siblings[siblingIndex - 1]!;
          const targetNodeId = yield* findDeepestLastChild(prevSiblingId);
          const targetNode = yield* Node.get(targetNodeId);
          const endPos = targetNode.textContent.length;

          const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: targetBlockId,
              anchorOffset: endPos,
              focusBlockId: targetBlockId,
              focusOffset: endPos,
              goalX: null,
              goalLine: null,
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        } else if (parentId === rootNodeId) {
          const rootNode = yield* Node.get(parentId);
          const endPos = rootNode.textContent.length;

          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: bufferId as unknown as Id.Block, // Title uses bufferId
              anchorOffset: endPos,
              focusBlockId: bufferId as unknown as Id.Block,
              focusOffset: endPos,
              goalX: null,
              goalLine: null,
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          const parentNode = yield* Node.get(parentId);
          const endPos = parentNode.textContent.length;

          const parentBlockId = Id.makeBlockId(bufferId, parentId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: parentBlockId,
              anchorOffset: endPos,
              focusBlockId: parentBlockId,
              focusOffset: endPos,
              goalX: null,
              goalLine: null,
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: parentBlockId }),
          );
        }
      }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
    );
  };

  const handleArrowRightAtEnd = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const children = yield* Node.getNodeChildren(nodeId);

        if (children.length > 0) {
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
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        const findNextNode = (
          currentId: Id.Node,
        ): Effect.Effect<Id.Node | null, never, NodeT> =>
          Effect.gen(function* () {
            const Node = yield* NodeT;
            const parentId = yield* Node.getParent(currentId).pipe(
              Effect.catchTag("NodeHasNoParentError", () =>
                Effect.succeed(null as Id.Node | null),
              ),
            );
            if (!parentId) return null;

            const siblings = yield* Node.getNodeChildren(parentId);
            const idx = siblings.indexOf(currentId);

            if (idx < siblings.length - 1) {
              return siblings[idx + 1]!;
            }

            return yield* findNextNode(parentId);
          });

        const nextNodeId = yield* findNextNode(nodeId);
        if (!nextNodeId) return;

        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchorBlockId: targetBlockId,
            anchorOffset: 0,
            focusBlockId: targetBlockId,
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

  const handleArrowUpOnFirstLine = (cursorGoalX: number) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX = Option.isSome(existingSelection) && existingSelection.value.goalX != null
          ? existingSelection.value.goalX
          : cursorGoalX;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const parentId = yield* Node.getParent(nodeId);
        const siblings = yield* Node.getNodeChildren(parentId);
        const siblingIndex = siblings.indexOf(nodeId);

        const findDeepestLastChild = (
          startNodeId: Id.Node,
        ): Effect.Effect<Id.Node, never, NodeT> =>
          Effect.gen(function* () {
            const Node = yield* NodeT;
            const children = yield* Node.getNodeChildren(startNodeId);
            if (children.length === 0) {
              return startNodeId;
            }
            const lastChild = children[children.length - 1]!;
            return yield* findDeepestLastChild(lastChild);
          });

        if (siblingIndex > 0) {
          const prevSiblingId = siblings[siblingIndex - 1]!;
          const targetNodeId = yield* findDeepestLastChild(prevSiblingId);

          const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: targetBlockId,
              anchorOffset: 0,
              focusBlockId: targetBlockId,
              focusOffset: 0,
              goalX,
              goalLine: "last",
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        } else if (parentId === rootNodeId) {
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: bufferId as unknown as Id.Block,
              anchorOffset: 0,
              focusBlockId: bufferId as unknown as Id.Block,
              focusOffset: 0,
              goalX,
              goalLine: "last",
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          // First child of non-root parent → go to parent
          const parentBlockId = Id.makeBlockId(bufferId, parentId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: parentBlockId,
              anchorOffset: 0,
              focusBlockId: parentBlockId,
              focusOffset: 0,
              goalX,
              goalLine: "last",
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: parentBlockId }),
          );
        }
      }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
    );
  };

  const handleArrowDownOnLastLine = (cursorGoalX: number) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX = Option.isSome(existingSelection) && existingSelection.value.goalX != null
          ? existingSelection.value.goalX
          : cursorGoalX;

        const children = yield* Node.getNodeChildren(nodeId);

        // If has children, go to first child
        if (children.length > 0) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchorBlockId: targetBlockId,
              anchorOffset: 0,
              focusBlockId: targetBlockId,
              focusOffset: 0,
              goalX,
              goalLine: "first",
              assoc: null,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Find next node in document order (next sibling, or parent's next sibling, etc.)
        const findNextNode = (
          currentId: Id.Node,
        ): Effect.Effect<Id.Node | null, never, NodeT> =>
          Effect.gen(function* () {
            const Node = yield* NodeT;
            const parentId = yield* Node.getParent(currentId).pipe(
              Effect.catchTag("NodeHasNoParentError", () =>
                Effect.succeed(null as Id.Node | null),
              ),
            );
            if (!parentId) return null;

            const siblings = yield* Node.getNodeChildren(parentId);
            const idx = siblings.indexOf(currentId);

            if (idx < siblings.length - 1) {
              return siblings[idx + 1]!;
            }

            return yield* findNextNode(parentId);
          });

        const nextNodeId = yield* findNextNode(nodeId);
        if (!nextNodeId) return;

        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchorBlockId: targetBlockId,
            anchorOffset: 0,
            focusBlockId: targetBlockId,
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
            onShiftTab={handleShiftTab}
            onBackspaceAtStart={handleBackspaceAtStart}
            onArrowLeftAtStart={handleArrowLeftAtStart}
            onArrowRightAtEnd={handleArrowRightAtEnd}
            onArrowUpOnFirstLine={handleArrowUpOnFirstLine}
            onArrowDownOnLastLine={handleArrowDownOnLastLine}
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
