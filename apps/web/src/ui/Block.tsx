import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { NavigationT } from "@/services/ui/Navigation";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Option, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import TextEditor, { type EnterKeyInfo, type SelectionInfo } from "./TextEditor";

interface BlockProps {
  blockId: Id.Block;
}

/**
 * Renders an editable hierarchical block and keeps it synchronized with the application runtime and Yjs document state.
 *
 * The component displays read-only text when inactive and a rich text editor when active; it manages focus, selection, document stream subscription, Y.Text observation, and user editing/navigation behaviors (split/merge, indent/outdent, arrow navigation, zoom) for the given block.
 *
 * @param blockId - The block identifier to render and synchronize (Id.Block)
 * @returns The block's rendered TSX element containing the editor or read-only view and its child blocks
 */
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
      isActive: view.isActive,
      childBlockIds: view.childBlockIds,
      selection: view.selection,
    }),
    initial: {
      isActive: false,
      childBlockIds: [] as readonly Id.Block[],
      selection: null as { anchor: number; head: number; goalX: number | null; goalLine: "first" | "last" | null; assoc: -1 | 0 | 1 } | null,
    },
  });

  // Get Y.Text and UndoManager for this block's node
  const [, nodeId] = Id.parseBlockId(blockId).pipe(
    Effect.runSync,
  );
  const Yjs = runtime.runSync(YjsT);
  const ytext = Yjs.getText(nodeId);
  const undoManager = Yjs.getUndoManager(nodeId);

  const [textContent, setTextContent] = createSignal(ytext.toString());
  const [isListElement, setIsListElement] = createSignal(false);

  onMount(() => {
    const dispose = start(runtime);

    const observer = () => setTextContent(ytext.toString());
    ytext.observe(observer);

    const typesFiber = runtime.runFork(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        const stream = yield* Type.subscribeTypes(nodeId);
        yield* Stream.runForEach(stream, (types) =>
          Effect.sync(() => {
            setIsListElement(types.includes(System.LIST_ELEMENT));
          }),
        );
      }),
    );

    onCleanup(() => {
      dispose();
      ytext.unobserve(observer);
      runtime.runFork(Fiber.interrupt(typesFiber));
    });
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

  // Text changes are now handled directly by Yjs via yCollab extension

  const handleSelectionChange = (selection: SelectionInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId] = yield* Id.parseBlockId(blockId);
        const Buffer = yield* BufferT;
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: selection.anchor,
            focus: { nodeId },
            focusOffset: selection.head,
            goalX: null,
            goalLine: null,
            assoc: selection.assoc,
          }),
        );
      }),
    );
  };

  const handleBlur = () => {
    // Don't clear selection when window loses focus (alt-tab, tab switch).
    // Only clear when user clicks elsewhere within the document.
    if (!document.hasFocus()) {
      return;
    }

    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Only clear selection and activeElement if still pointing to this block.
        // If navigating to another block, they already point there - don't clear.
        const selectionOpt = yield* Buffer.getSelection(bufferId);
        const sel = Option.getOrNull(selectionOpt);
        if (sel && sel.anchor.nodeId === nodeId) {
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Window.setActiveElement(Option.none());
        }
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
        const Yjs = yield* YjsT;

        // Get parent of current node
        const parentId = yield* Node.getParent(nodeId);

        const isAtStart = info.cursorPos === 0 && info.textAfter.length > 0;

        // Create new node
        const newNodeId = yield* Node.insertNode({
          parentId,
          insert: isAtStart ? "before" : "after",
          siblingId: nodeId,
        });

        // Update Y.Text content for split
        if (isAtStart) {
          // Cursor at start: new block gets empty, current block keeps content
          // No Y.Text changes needed - current block already has the text
        } else {
          // Normal case: current block keeps text before cursor, new block gets text after
          // 1. Delete text after cursor from current Y.Text
          ytext.delete(info.cursorPos, ytext.length - info.cursorPos);
          // 2. Insert text into new node's Y.Text
          const newYtext = Yjs.getText(newNodeId);
          newYtext.insert(0, info.textAfter);
        }

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
            assoc: 0,
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
        const Yjs = yield* YjsT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const parentId = yield* Node.getParent(nodeId);
        const siblings = yield* Node.getNodeChildren(parentId);
        const siblingIndex = siblings.indexOf(nodeId);

        // Find the deepest last child of a node (visually previous block)
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

        // Get current text from Y.Text
        const currentText = ytext.toString();

        // First sibling: merge into parent
        if (siblingIndex === 0) {
          const parentYtext = Yjs.getText(parentId);
          const mergePoint = parentYtext.length;

          // Append current text to parent's Y.Text
          parentYtext.insert(mergePoint, currentText);

          // Delete current node and cleanup Y.Text
          yield* Store.commit(
            events.nodeDeleted({
              timestamp: Date.now(),
              data: { nodeId },
            }),
          );
          Yjs.deleteText(nodeId);

          // Move focus to parent (title if root, otherwise block)
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId: parentId },
              anchorOffset: mergePoint,
              focus: { nodeId: parentId },
              focusOffset: mergePoint,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          if (parentId === rootNodeId) {
            yield* Window.setActiveElement(
              Option.some({ type: "title" as const, bufferId }),
            );
          } else {
            const parentBlockId = Id.makeBlockId(bufferId, parentId);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: parentBlockId }),
            );
          }
          return;
        }

        const prevSiblingId = siblings[siblingIndex - 1]!;
        const targetNodeId = yield* findDeepestLastChild(prevSiblingId);
        const targetYtext = Yjs.getText(targetNodeId);
        const mergePoint = targetYtext.length;

        // Append current text to target's Y.Text
        targetYtext.insert(mergePoint, currentText);

        // Delete current node and cleanup Y.Text
        yield* Store.commit(
          events.nodeDeleted({
            timestamp: Date.now(),
            data: { nodeId },
          }),
        );
        Yjs.deleteText(nodeId);

        const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: targetNodeId },
            anchorOffset: mergePoint,
            focus: { nodeId: targetNodeId },
            focusOffset: mergePoint,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }).pipe(Effect.catchTag("NodeHasNoParentError", () => Effect.void)),
    );
  };

  const handleDeleteAtEnd = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Yjs = yield* YjsT;

        const children = yield* Node.getNodeChildren(nodeId);

        // If has children, merge with first child
        if (children.length > 0) {
          const firstChildId = children[0]!;
          const mergePoint = ytext.length;
          const childYtext = Yjs.getText(firstChildId);
          const childText = childYtext.toString();

          // Append child text to current Y.Text
          ytext.insert(mergePoint, childText);

          // Delete child node and cleanup Y.Text
          yield* Store.commit(
            events.nodeDeleted({
              timestamp: Date.now(),
              data: { nodeId: firstChildId },
            }),
          );
          Yjs.deleteText(firstChildId);

          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId },
              anchorOffset: mergePoint,
              focus: { nodeId },
              focusOffset: mergePoint,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
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

        const mergePoint = ytext.length;
        const nextYtext = Yjs.getText(nextNodeId);
        const nextText = nextYtext.toString();

        // Append next text to current Y.Text
        ytext.insert(mergePoint, nextText);

        // Delete next node and cleanup Y.Text
        yield* Store.commit(
          events.nodeDeleted({
            timestamp: Date.now(),
            data: { nodeId: nextNodeId },
          }),
        );
        Yjs.deleteText(nextNodeId);

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: mergePoint,
            focus: { nodeId },
            focusOffset: mergePoint,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );
      }),
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

        const Yjs = yield* YjsT;

        if (siblingIndex > 0) {
          const prevSiblingId = siblings[siblingIndex - 1]!;
          const targetNodeId = yield* findDeepestLastChild(prevSiblingId);
          const targetYtext = Yjs.getText(targetNodeId);
          const endPos = targetYtext.length;

          const targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId: targetNodeId },
              anchorOffset: endPos,
              focus: { nodeId: targetNodeId },
              focusOffset: endPos,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        } else {
          // Move to parent (title if root, otherwise block)
          const parentYtext = Yjs.getText(parentId);
          const endPos = parentYtext.length;

          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId: parentId },
              anchorOffset: endPos,
              focus: { nodeId: parentId },
              focusOffset: endPos,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          if (parentId === rootNodeId) {
            yield* Window.setActiveElement(
              Option.some({ type: "title" as const, bufferId }),
            );
          } else {
            const parentBlockId = Id.makeBlockId(bufferId, parentId);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: parentBlockId }),
            );
          }
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
              anchor: { nodeId: firstChildId },
              anchorOffset: 0,
              focus: { nodeId: firstChildId },
              focusOffset: 0,
              goalX: null,
              goalLine: null,
              assoc: 0,
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
            anchor: { nodeId: nextNodeId },
            anchorOffset: 0,
            focus: { nodeId: nextNodeId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
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
              anchor: { nodeId: targetNodeId },
              anchorOffset: 0,
              focus: { nodeId: targetNodeId },
              focusOffset: 0,
              goalX,
              goalLine: "last",
              assoc: 0,
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
        } else {
          // First child → go to parent (title if root, otherwise block)
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId: parentId },
              anchorOffset: 0,
              focus: { nodeId: parentId },
              focusOffset: 0,
              goalX,
              goalLine: "last",
              assoc: 0,
            }),
          );
          if (parentId === rootNodeId) {
            yield* Window.setActiveElement(
              Option.some({ type: "title" as const, bufferId }),
            );
          } else {
            const parentBlockId = Id.makeBlockId(bufferId, parentId);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: parentBlockId }),
            );
          }
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
              anchor: { nodeId: firstChildId },
              anchorOffset: 0,
              focus: { nodeId: firstChildId },
              focusOffset: 0,
              goalX,
              goalLine: "first",
              assoc: 0,
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
        if (!nextNodeId) {
          // No next block - move cursor to end of current block
          const Yjs = yield* YjsT;
          const textLength = Yjs.getText(nodeId).length;
          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { nodeId },
              anchorOffset: textLength,
              focus: { nodeId },
              focusOffset: textLength,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          return;
        }

        const targetBlockId = Id.makeBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: nextNodeId },
            anchorOffset: 0,
            focus: { nodeId: nextNodeId },
            focusOffset: 0,
            goalX,
            goalLine: "first",
            assoc: 0,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  const handleZoomIn = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Navigation = yield* NavigationT;
        const Window = yield* WindowT;
        yield* Navigation.navigateTo(nodeId);
        yield* Window.setActiveElement(
          Option.some({ type: "title" as const, bufferId }),
        );
      }),
    );
  };

  const handleListTrigger = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        yield* Type.addType(nodeId, System.LIST_ELEMENT);
      }),
    );
  };

  return (
    <div data-element-id={blockId} data-element-type="block">
      <div onClick={handleFocus} class="flex">
        <Show when={isListElement()}>
          <span class="w-5 shrink-0 text-[length:var(--text-block)] leading-[var(--text-block--line-height)] select-none">
            •
          </span>
        </Show>
        <div class="flex-1 min-w-0">
          <Show
            when={store.isActive}
            fallback={
              <p class="font-[family-name:var(--font-sans)] text-[length:var(--text-block)] leading-[var(--text-block--line-height)] min-h-[var(--text-block--line-height)] whitespace-break-spaces">
                {textContent() || "\u00A0"}
              </p>
            }
          >
            <TextEditor
              ytext={ytext}
              undoManager={undoManager}
              onEnter={handleEnter}
              onTab={handleTab}
              onShiftTab={handleShiftTab}
              onBackspaceAtStart={handleBackspaceAtStart}
              onDeleteAtEnd={handleDeleteAtEnd}
              onArrowLeftAtStart={handleArrowLeftAtStart}
              onArrowRightAtEnd={handleArrowRightAtEnd}
              onArrowUpOnFirstLine={handleArrowUpOnFirstLine}
              onArrowDownOnLastLine={handleArrowDownOnLastLine}
              onSelectionChange={handleSelectionChange}
              onBlur={handleBlur}
              onZoomIn={handleZoomIn}
              onListTrigger={handleListTrigger}
              initialClickCoords={clickCoords}
              initialSelection={initialSelection}
              selection={store.selection}
            />
          </Show>
        </div>
      </div>
      <div class="pl-4">
        <For each={store.childBlockIds}>
          {(childId) => <Block blockId={childId} />}
        </For>
      </div>
    </div>
  );
}
