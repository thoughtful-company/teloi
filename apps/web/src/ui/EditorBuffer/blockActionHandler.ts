import type { ManagedRuntime } from "effect/ManagedRuntime";
import { Effect, Match, Option } from "effect";
import type { BrowserRequirements } from "@/runtime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { NavigationT } from "@/services/ui/Navigation";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import type { EditorAction } from "../TextEditor";
import type { BlockNavigationContext } from "../Block";

/**
 * Tree navigation action handler for blocks within an EditorBuffer.
 *
 * Handles actions that affect tree structure or navigate between blocks:
 * - Enter (split block)
 * - Tab/ShiftTab (indent/outdent)
 * - Arrow navigation (between blocks)
 * - Backspace/Delete at boundaries (merge blocks)
 * - Move actions (swap, first, last)
 * - Zoom in/out (buffer navigation)
 * - Block selection (Escape)
 * - Property trigger (creates property, deletes block)
 *
 * Block-local actions (type triggers, selection changes, etc.) fall through
 * to the Block component's internal handlers.
 */
export function createBlockActionHandler(
  runtime: ManagedRuntime<BrowserRequirements, never>,
  bufferId: Id.Buffer,
) {
  // Helper to wait for DOM and refocus after block movement
  const waitForDomAndRefocus = (blockId: Id.Block) =>
    Effect.gen(function* () {
      yield* Effect.promise(
        () =>
          new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))),
      );
      yield* Effect.sync(() => {
        const blockEl = document.querySelector(
          `[data-element-id="${CSS.escape(blockId)}"] .cm-content`,
        );
        if (blockEl instanceof HTMLElement) {
          blockEl.focus();
        }
      });
    });

  return (
    action: EditorAction,
    context: BlockNavigationContext,
  ): boolean | void => {
    const { blockId } = context;
    const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);

    return Match.value(action).pipe(
      Match.tags({
        // Enter has picker-related logic in Block, let Block handle it
        Enter: () => false,
        Tab: () => {
          handleTab(nodeId);
          return true;
        },
        ShiftTab: () => {
          handleShiftTab(nodeId);
          return true;
        },
        BackspaceAtStart: () => {
          // If type wants removal, let Block handle it
          for (const def of context.activeDefinitions) {
            if (def.backspace?.removeTypeAtStart) {
              return false; // Let Block handle type removal
            }
          }
          handleBackspaceAtStart(blockId, nodeId);
          return true;
        },
        DeleteAtEnd: () => {
          handleDeleteAtEnd(blockId, nodeId);
          return true;
        },
        ForceDelete: () => {
          handleForceDelete(blockId, nodeId);
          return true;
        },
        Navigate: ({ direction, goalX }) =>
          Match.value(direction).pipe(
            Match.when("left", () => {
              handleArrowLeftAtStart(blockId, nodeId);
              return true;
            }),
            Match.when("right", () => {
              handleArrowRightAtEnd(blockId, nodeId, context.isExpanded);
              return true;
            }),
            Match.when("up", () => {
              handleArrowUpOnFirstLine(blockId, nodeId, goalX ?? 0);
              return true;
            }),
            Match.when("down", () => {
              handleArrowDownOnLastLine(
                blockId,
                nodeId,
                goalX ?? 0,
                context.isExpanded,
              );
              return true;
            }),
            Match.exhaustive,
          ),
        ZoomIn: () => {
          handleZoomIn(blockId, nodeId);
          return true;
        },
        ZoomOut: () => {
          handleZoomOut(blockId, nodeId);
          return true;
        },
        // Escape is handled by Block (checks picker state first)
        Escape: () => false,
        BlockSelect: () => {
          enterBlockSelectionMode(blockId, nodeId);
          return true;
        },
        Move: ({ action: moveAction }) => {
          handleMove(blockId, nodeId, moveAction);
          return true;
        },
        PropertyTrigger: () => {
          handlePropertyTrigger(nodeId);
          return true;
        },

        // Block-local actions - let Block handle them
        SelectionChange: () => false,
        VerticalMove: () => false,
        Blur: () => false,
        TypeTrigger: () => false,
        TypePickerOpen: () => false,
        TypePickerUpdate: () => false,
        TypePickerClose: () => false,
        ToggleTodo: () => false,
        Expand: () => false,
      }),
      Match.exhaustive,
    );
  };


  function handleTab(nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        yield* Buffer.indent(bufferId, [nodeId]);
        // Re-set selection to trigger ancestor expansion for new tree structure
        const selection = yield* Buffer.getSelection(bufferId);
        yield* Buffer.setSelection(bufferId, selection);
      }),
    );
  }

  function handleShiftTab(nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        yield* Buffer.outdent(bufferId, [nodeId]);
      }),
    );
  }

  function handleBackspaceAtStart(_blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const result = yield* Buffer.mergeBackward(bufferId, nodeId);
        if (Option.isNone(result)) return;

        const { targetNodeId, cursorOffset, isTitle } = result.value;
        const targetElementId = Id.makeBufferBlockId(bufferId, targetNodeId);

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetElementId, cursorOffset),
        );

        if (isTitle) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetElementId }),
          );
        }
      }),
    );
  }

  function handleDeleteAtEnd(blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;

        const result = yield* Buffer.mergeForward(bufferId, nodeId);
        if (Option.isNone(result)) return;

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(blockId, result.value.cursorOffset),
        );
      }),
    );
  }

  function handleForceDelete(_blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;
        const Store = yield* StoreT;
        const Node = yield* NodeT;
        const Yjs = yield* YjsT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? (bufferDoc.value.assignedNodeId as Id.Node)
          : null;

        // Collect all descendants BEFORE deletion (they'll be gone from DB after)
        const descendants = yield* Node.getAllDescendants(nodeId);
        const allNodesToDelete = [nodeId, ...descendants];

        // Find focus target before deletion
        const prevNodeOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        const focusNodeId = Option.isSome(prevNodeOpt)
          ? prevNodeOpt.value
          : rootNodeId;

        if (!focusNodeId) return;

        // Delete the node (materializer cascades to descendants in DB)
        yield* Node.deleteNode(nodeId);

        // Clean up Yjs text for all deleted nodes
        for (const deletedId of allNodesToDelete) {
          Yjs.deleteText(deletedId);
        }

        // Set cursor at end of focus target
        const targetYtext = Yjs.getText(focusNodeId);
        const cursorOffset = targetYtext.length;
        const focusElementId = Id.makeBufferBlockId(bufferId, focusNodeId);

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(focusElementId, cursorOffset),
        );

        // Update active element
        if (focusNodeId === rootNodeId) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: focusElementId }),
          );
        }
      }),
    );
  }

  function handleArrowLeftAtStart(_blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;
        const Yjs = yield* YjsT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        if (Option.isNone(targetOpt)) return;

        const targetNodeId = targetOpt.value;
        const targetYtext = Yjs.getText(targetNodeId);
        const endPos = targetYtext.length;
        const targetElementId = Id.makeBufferBlockId(bufferId, targetNodeId);

        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetElementId, endPos),
        );

        if (targetNodeId === rootNodeId) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetElementId }),
          );
        }
      }),
    );
  }

  function handleArrowRightAtEnd(
    _blockId: Id.Block,
    nodeId: Id.Node,
    isExpanded: boolean,
  ) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // If has visible children (expanded), go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0 && isExpanded) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBufferBlockId(bufferId, firstChildId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, 0),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Otherwise (no children or collapsed), find next node in document order
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        if (Option.isNone(nextNodeOpt)) return;

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBufferBlockId(bufferId, nextNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetBlockId, 0),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  }

  function handleArrowUpOnFirstLine(
    _blockId: Id.Block,
    nodeId: Id.Node,
    cursorGoalX: number,
  ) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : cursorGoalX;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const rootNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;

        const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
        if (Option.isNone(targetOpt)) return;

        const targetNodeId = targetOpt.value;
        const targetElementId = Id.makeBufferBlockId(bufferId, targetNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetElementId, 0, {
            goalX,
            goalLine: "last",
          }),
        );

        if (targetNodeId === rootNodeId) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        } else {
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetElementId }),
          );
        }
      }),
    );
  }

  function handleArrowDownOnLastLine(
    blockId: Id.Block,
    nodeId: Id.Node,
    cursorGoalX: number,
    isExpanded: boolean,
  ) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Node = yield* NodeT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Preserve existing goalX if set (for chained arrow navigation)
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const goalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : cursorGoalX;

        yield* Effect.logDebug(
          "[blockActionHandler.handleArrowDownOnLastLine] Entered",
        ).pipe(
          Effect.annotateLogs({
            blockId,
            nodeId,
            cursorGoalX,
            resolvedGoalX: goalX,
          }),
        );

        // If has visible children (expanded), go to first child
        const children = yield* Node.getNodeChildren(nodeId);
        if (children.length > 0 && isExpanded) {
          const firstChildId = children[0]!;
          const targetBlockId = Id.makeBufferBlockId(bufferId, firstChildId);
          yield* Effect.logDebug(
            "[blockActionHandler.handleArrowDownOnLastLine] Has visible children, going to first child",
          ).pipe(
            Effect.annotateLogs({
              childrenCount: children.length,
              targetNodeId: firstChildId,
              isExpanded,
            }),
          );
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, 0, {
              goalX,
              goalLine: "first",
            }),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return;
        }

        // Find next node in document order (no children or collapsed)
        const nextNodeOpt = yield* Block.findNextNode(nodeId);
        yield* Effect.logDebug(
          "[blockActionHandler.handleArrowDownOnLastLine] findNextNode result",
        ).pipe(
          Effect.annotateLogs({
            hasNext: Option.isSome(nextNodeOpt),
            nextNodeId: Option.getOrNull(nextNodeOpt),
          }),
        );

        if (Option.isNone(nextNodeOpt)) {
          // No next block - move cursor to end of current block
          const Yjs = yield* YjsT;
          const textLength = Yjs.getText(nodeId).length;
          yield* Effect.logDebug(
            "[blockActionHandler.handleArrowDownOnLastLine] No next block, staying at end",
          ).pipe(Effect.annotateLogs({ textLength }));
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(blockId, textLength),
          );
          return;
        }

        const nextNodeId = nextNodeOpt.value;
        const targetBlockId = Id.makeBufferBlockId(bufferId, nextNodeId);
        yield* Effect.logDebug(
          "[blockActionHandler.handleArrowDownOnLastLine] Moving to next node",
        ).pipe(Effect.annotateLogs({ nextNodeId, targetBlockId }));
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(targetBlockId, 0, {
            goalX,
            goalLine: "first",
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  }

  function handleZoomIn(_blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Navigation = yield* NavigationT;
        const Window = yield* WindowT;
        yield* Navigation.navigateTo(nodeId);
        yield* Window.setActiveElement(
          Option.some({ type: "title" as const, bufferId }),
        );
      }),
    );
  }

  function handleZoomOut(_blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;
        const Navigation = yield* NavigationT;
        const Window = yield* WindowT;
        const Block = yield* BlockT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        if (Option.isNone(bufferDoc) || !bufferDoc.value.assignedNodeId) return;

        const rootNodeId = Id.Node.make(bufferDoc.value.assignedNodeId);
        const parentId = yield* Node.getParent(rootNodeId).pipe(
          Effect.catchTag("NodeHasNoParentError", () =>
            Effect.succeed<Id.Node | null>(null),
          ),
        );

        if (!parentId) return;

        yield* Navigation.navigateTo(parentId);

        // Check if the previous root (now a block) is expanded
        const rootBlockId = Id.makeBufferBlockId(bufferId, rootNodeId);
        const isRootExpanded = yield* Block.isExpanded(rootBlockId);

        // If expanded, select the original node; if collapsed, select the root block
        const targetBlockId = isRootExpanded
          ? Id.makeBufferBlockId(bufferId, nodeId)
          : rootBlockId;

        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
        // Block scrolls itself on mount via ActiveElementContext
      }),
    );
  }

  function enterBlockSelectionMode(_blockId: Id.Block, nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;

        // Switch to block selection mode
        yield* Window.setActiveElement(
          Option.some({ type: "buffer" as const, id: bufferId }),
        );
        // Clear text selection - when returning from block selection, cursor should start fresh
        yield* Buffer.setSelection(bufferId, Option.none());
        yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);
      }),
    );
  }

  function handleMove(
    blockId: Id.Block,
    nodeId: Id.Node,
    moveAction: "swapUp" | "swapDown" | "first" | "last",
  ) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Node = yield* NodeT;
        const Store = yield* StoreT;
        const Buffer = yield* BufferT;

        // For swap actions, check if at buffer boundary (can't outdent past buffer root)
        if (moveAction === "swapUp" || moveAction === "swapDown") {
          const parentId = yield* Node.getParent(nodeId).pipe(
            Effect.catchTag("NodeHasNoParentError", () =>
              Effect.succeed<Id.Node | null>(null),
            ),
          );
          const siblings = parentId
            ? yield* Node.getNodeChildren(parentId)
            : [];
          const index = siblings.indexOf(nodeId);
          const isAtBoundary =
            (moveAction === "swapUp" && index === 0) ||
            (moveAction === "swapDown" && index === siblings.length - 1);

          if (isAtBoundary && parentId) {
            // Check if parent is the buffer root
            const bufferDoc = yield* Store.getDocument(
              "buffer",
              bufferId,
            ).pipe(Effect.orDie);
            const assignedNodeId = Option.match(bufferDoc, {
              onNone: () => null,
              onSome: (doc) => doc.assignedNodeId,
            });
            if (parentId === assignedNodeId) {
              // At buffer root boundary - can't outdent further
              return;
            }
          }
        }

        const moved = yield* Match.value(moveAction).pipe(
          Match.when("swapUp", () => Block.swap(nodeId, "up")),
          Match.when("swapDown", () => Block.swap(nodeId, "down")),
          Match.when("first", () => Block.moveToFirst(nodeId)),
          Match.when("last", () => Block.moveToLast(nodeId)),
          Match.exhaustive,
        );
        if (moved) {
          // Re-set selection to trigger ancestor expansion for new tree position
          const selection = yield* Buffer.getSelection(bufferId);
          yield* Buffer.setSelection(bufferId, selection);
          yield* waitForDomAndRefocus(blockId);
        }
      }),
    );
  }

  function handlePropertyTrigger(nodeId: Id.Node) {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        const View = yield* ViewT;
        const Property = yield* PropertyT;
        const Node = yield* NodeT;
        const Window = yield* WindowT;

        const pageId = yield* Buffer.getAssignedNodeId(bufferId);
        if (pageId === null) return;

        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);
        yield* Node.deleteNode(nodeId);

        yield* Window.setActiveElement(
          Option.some({
            type: "property" as const,
            propertyId,
            bufferId,
          }),
        );
      }),
    );
  }
}
