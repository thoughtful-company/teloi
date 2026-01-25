/**
 * Block Selection Mode Handlers for ActionT.
 *
 * Document-level actions when in block selection mode:
 * - Arrow navigation, selection extension
 * - Copy/cut/delete operations
 * - Indent/outdent, move operations
 */

import { Id } from "@/schema";
import * as BlockType from "@/services/ui/BlockType";
import type { EditorMode } from "@/services/ui/Buffer";
import { Effect, Match, Option } from "effect";
import type { NavigationHandlers } from "./navigation";
import {
  ActionResult,
  type ActionDeps,
  type AppAction,
  type SafeWrapper,
} from "./types";

export interface BlockSelectionHandlers {
  handleDocumentAction: (
    action: AppAction,
    mode: EditorMode,
    bufferId: Id.Buffer,
  ) => Effect.Effect<ActionResult>;
}

export const createBlockSelectionHandlers = (
  deps: ActionDeps,
  _nav: NavigationHandlers,
  safe: SafeWrapper,
): BlockSelectionHandlers => {
  const { Buffer, Block, Node, Automerge, Store, Window } = deps;

  /**
   * Get all visible blocks under a root node (respects collapsed state).
   */
  const getAllVisibleBlocks = (
    rootNodeId: Id.Node,
    bufferId: Id.Buffer,
  ): Effect.Effect<Id.Node[]> =>
    Effect.gen(function* () {
      const result: Id.Node[] = [];

      const collectVisible = (nodeId: Id.Node): Effect.Effect<void> =>
        Effect.gen(function* () {
          const children = yield* Node.getNodeChildren(nodeId);
          for (const childId of children) {
            result.push(childId);

            // Check if expanded
            const blockId = Id.makeBufferBlockId(bufferId, childId);
            const isExpanded = yield* Block.isExpanded(blockId);
            if (isExpanded) {
              yield* collectVisible(childId);
            }
          }
        });

      yield* collectVisible(rootNodeId);
      return result;
    });

  /**
   * Delete all selected blocks and return focus info.
   * Deletes in reverse document order (bottom to top) to handle nested selections.
   *
   * Focus logic:
   * - Single block: prefer next sibling (stay at same level)
   * - Multiple blocks: use previous node of first block (go before selection)
   */
  const deleteSelectedBlocks = (
    bufferId: Id.Buffer,
    selectedBlocks: readonly Id.Node[],
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        if (selectedBlocks.length === 0) {
          return ActionResult.handled({});
        }

        // For single block deletion, check for next sibling FIRST
        let nextSiblingId: Id.Node | null = null;
        if (selectedBlocks.length === 1) {
          const nodeId = selectedBlocks[0]!;
          const parentId = yield* Node.getParent(nodeId).pipe(
            Effect.catchTag("NodeHasNoParentError", () =>
              Effect.succeed<Id.Node | null>(null),
            ),
          );
          if (parentId) {
            const siblings = yield* Node.getNodeChildren(parentId);
            const idx = siblings.indexOf(nodeId);
            if (idx >= 0 && idx < siblings.length - 1) {
              nextSiblingId = siblings[idx + 1]!;
            }
          }
        }

        // Delete in reverse order (bottom to top)
        // The last deletion (first block in doc order) determines focus target
        let focusResult: {
          targetNodeId: Id.Node;
          isTitle: boolean;
        } | null = null;

        const reversed = [...selectedBlocks].reverse();
        for (const nodeId of reversed) {
          const result = yield* Buffer.forceDelete(bufferId, nodeId);
          if (Option.isSome(result)) {
            // Keep updating - we want the LAST result (first block in doc order)
            focusResult = result.value;
          }
        }

        // For single block, prefer next sibling over previous node
        if (nextSiblingId && selectedBlocks.length === 1) {
          focusResult = {
            targetNodeId: nextSiblingId,
            isTitle: false,
          };
        }
        if (focusResult) {
          const { targetNodeId, isTitle } = focusResult;
          const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

          if (isTitle) {
            yield* Buffer.setBlockSelection(bufferId, [], targetNodeId);
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: targetBlockId }),
            );
            // EditorMode updates via Title's focus handler
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            yield* Buffer.setBlockSelection(
              bufferId,
              [targetNodeId],
              targetNodeId,
              targetNodeId,
            );
            return ActionResult.handled({
              scroll: targetBlockId,
            });
          }
        }

        return ActionResult.handled({});
      }),
    );

  const handleBlockSelectionArrow = (
    bufferId: Id.Buffer,
    direction: "up" | "down",
    shift: boolean,
    selectedBlocks: readonly Id.Node[],
    blockSelectionAnchor: Id.Node | null,
    blockSelectionFocus: Id.Node | null,
    lastFocusedBlockId: Id.Node | null,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        // When selection is empty, restore to lastFocusedBlockId or select first/last
        if (selectedBlocks.length === 0) {
          // If there's a lastFocusedBlockId, restore selection to it
          if (lastFocusedBlockId) {
            yield* Buffer.setBlockSelection(
              bufferId,
              [lastFocusedBlockId],
              lastFocusedBlockId,
              lastFocusedBlockId,
            );
            return ActionResult.handled({});
          }

          // Otherwise select first/last block of the buffer
          const nodeId = yield* Buffer.getAssignedNodeId(bufferId);
          if (!nodeId) {
            return ActionResult.handled({});
          }
          const children = yield* Node.getNodeChildren(nodeId);
          if (children.length === 0) {
            return ActionResult.handled({});
          }

          const targetBlock =
            direction === "down"
              ? children[0]!
              : children[children.length - 1]!;
          yield* Buffer.setBlockSelection(
            bufferId,
            [targetBlock],
            targetBlock,
            targetBlock,
          );
          return ActionResult.handled({});
        }

        const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;

        // Safety check - if we get here with selectedBlocks > 0, we should have an anchor
        if (!currentFocus) {
          return ActionResult.handled({});
        }

        if (shift) {
          // Extend selection - need valid anchor for shift navigation
          if (!blockSelectionAnchor) {
            return ActionResult.handled({});
          }

          const parentId = yield* Node.getParent(currentFocus);
          const siblings = yield* Node.getNodeChildren(parentId);
          const focusIndex = siblings.indexOf(currentFocus);
          const anchorIndex = siblings.indexOf(blockSelectionAnchor);

          if (anchorIndex === -1) {
            return ActionResult.handled({});
          }

          const newFocusIndex =
            direction === "up"
              ? Math.max(0, focusIndex - 1)
              : Math.min(siblings.length - 1, focusIndex + 1);

          const newFocus = siblings[newFocusIndex];
          if (!newFocus) {
            return ActionResult.handled({});
          }

          const startIndex = Math.min(anchorIndex, newFocusIndex);
          const endIndex = Math.max(anchorIndex, newFocusIndex);
          const newSelection = siblings.slice(startIndex, endIndex + 1);

          yield* Buffer.setBlockSelection(
            bufferId,
            newSelection,
            blockSelectionAnchor,
            newFocus,
          );

          return ActionResult.handled({
            scroll: Id.makeBufferBlockId(bufferId, newFocus),
          });
        } else {
          // Plain arrow: collapse multi-block selection or navigate single block

          // Multi-block selection: collapse to topmost (ArrowUp) or bottommost (ArrowDown)
          if (selectedBlocks.length > 1) {
            // Find topmost/bottommost in document order
            const targetNodeId =
              direction === "up"
                ? selectedBlocks[0] // First in array is topmost
                : selectedBlocks[selectedBlocks.length - 1]; // Last is bottommost

            if (targetNodeId) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [targetNodeId],
                targetNodeId,
                targetNodeId,
              );
              return ActionResult.handled({
                scroll: Id.makeBufferBlockId(bufferId, targetNodeId),
              });
            }
          }

          // Single block selection: document-order navigation
          let newFocus: Id.Node | null = null;

          if (direction === "up") {
            const prevOpt = yield* Block.findPreviousNode(
              currentFocus,
              bufferId,
            );
            if (Option.isSome(prevOpt)) {
              const bufferDoc = yield* Store.getDocument(
                "buffer",
                bufferId,
              ).pipe(Effect.orDie);
              const assignedNodeId = Option.match(bufferDoc, {
                onNone: () => null,
                onSome: (doc) => doc.assignedNodeId,
              });
              if (prevOpt.value !== assignedNodeId) {
                newFocus = prevOpt.value;
              }
            }
          } else {
            const nextOpt = yield* Block.findNextNodeInDocumentOrder(
              currentFocus,
              bufferId,
            );
            if (Option.isSome(nextOpt)) {
              newFocus = nextOpt.value;
            }
          }

          if (newFocus === null) {
            // ArrowUp at first block: scroll to title (buffer's assigned node)
            // ArrowDown at last block: do nothing
            if (direction === "up") {
              const bufferDoc = yield* Store.getDocument(
                "buffer",
                bufferId,
              ).pipe(Effect.orDie);
              const assignedNodeId = Option.match(bufferDoc, {
                onNone: () => null,
                onSome: (doc) => doc.assignedNodeId,
              });
              if (assignedNodeId) {
                const titleBlockId = Id.makeBufferBlockId(
                  bufferId,
                  Id.Node.make(assignedNodeId),
                );
                return ActionResult.handled({ scroll: titleBlockId });
              }
            }
            return ActionResult.handled({});
          }

          yield* Buffer.setBlockSelection(
            bufferId,
            [newFocus],
            newFocus,
            newFocus,
          );

          return ActionResult.handled({
            scroll: Id.makeBufferBlockId(bufferId, newFocus),
          });
        }
      }),
    );

  const handleDocumentAction = (
    action: AppAction,
    mode: EditorMode,
    bufferId: Id.Buffer,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        // Only handle in block selection mode
        if (mode.type !== "blockSelection") {
          return ActionResult.notHandled();
        }

        if (action._tag !== "KeyDown") {
          return ActionResult.notHandled();
        }

        const { key, modifiers } = action;

        // Get current block selection state
        const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
          Effect.orDie,
        );
        if (Option.isNone(bufferDoc)) {
          return ActionResult.notHandled();
        }

        const {
          selectedBlocks,
          blockSelectionAnchor,
          blockSelectionFocus,
          lastFocusedBlockId,
        } = bufferDoc.value;

        // --- Enter: Start editing selected block ---
        if (key === "Enter" && !modifiers.meta) {
          const targetBlock = blockSelectionFocus ?? blockSelectionAnchor;
          if (!targetBlock) {
            return ActionResult.notHandled();
          }

          const text = yield* Automerge.getText(targetBlock);
          const textLength = text.length;
          const blockId = Id.makeBufferBlockId(bufferId, targetBlock);

          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { elementId: blockId },
              anchorOffset: textLength,
              focus: { elementId: blockId },
              focusOffset: textLength,
              goalX: null,
              goalLine: null,
              assoc: 0,
            }),
          );
          yield* Buffer.setBlockSelection(bufferId, [], targetBlock);

          return ActionResult.handled({
            focus: {
              type: "block",
              blockId,
              selection: { anchor: textLength, head: textLength },
            },
          });
        }

        // --- Escape: Clear selection ---
        if (key === "Escape") {
          if (blockSelectionAnchor && blockSelectionFocus) {
            yield* Buffer.setBlockSelection(
              bufferId,
              [],
              blockSelectionAnchor,
              blockSelectionFocus,
            );
          }
          return ActionResult.handled({});
        }

        // --- Arrow navigation ---
        if (
          (key === "ArrowUp" || key === "ArrowDown") &&
          !modifiers.alt &&
          !modifiers.meta
        ) {
          return yield* handleBlockSelectionArrow(
            bufferId,
            key === "ArrowUp" ? "up" : "down",
            modifiers.shift,
            selectedBlocks,
            blockSelectionAnchor,
            blockSelectionFocus,
            lastFocusedBlockId,
          );
        }

        // --- Tab indent/outdent ---
        if (key === "Tab" && selectedBlocks.length > 0) {
          if (modifiers.shift) {
            yield* Buffer.outdent(bufferId, selectedBlocks);
          } else {
            yield* Buffer.indent(selectedBlocks);
          }
          yield* Buffer.setBlockSelection(
            bufferId,
            selectedBlocks,
            blockSelectionAnchor!,
            blockSelectionFocus,
          );
          return ActionResult.handled({});
        }

        // --- Mod+Enter: Toggle checkbox on selected blocks ---
        if (key === "Enter" && modifiers.meta && !modifiers.shift) {
          for (const nodeId of selectedBlocks) {
            yield* BlockType.toggleCheckbox(nodeId);
          }
          return ActionResult.handled({});
        }

        // --- Cmd+Up: Collapse selected blocks ---
        if (key === "ArrowUp" && modifiers.meta && !modifiers.alt) {
          if (selectedBlocks.length === 1) {
            const nodeId = selectedBlocks[0]!;
            const blockId = Id.makeBufferBlockId(bufferId, nodeId);
            const isExpanded = yield* Block.isExpanded(blockId);
            const children = yield* Node.getNodeChildren(nodeId);

            if (children.length > 0 && isExpanded) {
              // Has children and expanded: collapse
              yield* Block.setExpanded(blockId, false);
              return ActionResult.handled({});
            } else {
              // Collapsed or no children: navigate to parent
              const parentId = yield* Node.getParent(nodeId).pipe(
                Effect.catchTag("NodeHasNoParentError", () =>
                  Effect.succeed<Id.Node | null>(null),
                ),
              );

              if (parentId) {
                const assignedNodeId = bufferDoc.value.assignedNodeId;
                if (parentId === assignedNodeId) {
                  // Parent is title: focus title (EditorMode updates via focus handler)
                  const titleBlockId = Id.makeBufferBlockId(bufferId, parentId);
                  yield* Buffer.setBlockSelection(bufferId, [], nodeId);
                  yield* Window.setActiveElement(
                    Option.some({ type: "block" as const, id: titleBlockId }),
                  );
                  return ActionResult.handled({
                    focus: { type: "title", bufferId },
                  });
                } else {
                  // Navigate to parent block
                  yield* Buffer.setBlockSelection(
                    bufferId,
                    [parentId],
                    parentId,
                    parentId,
                  );
                  return ActionResult.handled({
                    scroll: Id.makeBufferBlockId(bufferId, parentId),
                  });
                }
              }
            }
          }
          return ActionResult.handled({});
        }

        // --- Cmd+Down: Expand selected blocks ---
        if (key === "ArrowDown" && modifiers.meta && !modifiers.alt) {
          for (const nodeId of selectedBlocks) {
            yield* Block.expandOneLevel(bufferId, nodeId);
          }
          return ActionResult.handled({});
        }

        // --- ArrowLeft: Navigate to parent ---
        if (key === "ArrowLeft" && !modifiers.shift && !modifiers.alt) {
          const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;
          if (!currentFocus) return ActionResult.handled({});

          const parentId = yield* Node.getParent(currentFocus).pipe(
            Effect.catchTag("NodeHasNoParentError", () =>
              Effect.succeed<Id.Node | null>(null),
            ),
          );

          if (parentId) {
            const assignedNodeId = bufferDoc.value.assignedNodeId;
            if (parentId !== assignedNodeId) {
              yield* Buffer.setBlockSelection(
                bufferId,
                [parentId],
                parentId,
                parentId,
              );
              return ActionResult.handled({
                scroll: Id.makeBufferBlockId(bufferId, parentId),
              });
            }
          }
          return ActionResult.handled({});
        }

        // --- ArrowRight: Navigate to first child ---
        if (key === "ArrowRight" && !modifiers.shift && !modifiers.alt) {
          const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;
          if (!currentFocus) return ActionResult.handled({});

          const blockId = Id.makeBufferBlockId(bufferId, currentFocus);
          const isExpanded = yield* Block.isExpanded(blockId);
          const children = yield* Node.getNodeChildren(currentFocus);

          if (children.length > 0 && isExpanded) {
            const firstChildId = children[0]!;
            yield* Buffer.setBlockSelection(
              bufferId,
              [firstChildId],
              firstChildId,
              firstChildId,
            );
            return ActionResult.handled({
              scroll: Id.makeBufferBlockId(bufferId, firstChildId),
            });
          }
          return ActionResult.handled({});
        }

        // --- Cmd+A: Select all blocks ---
        if (key === "a" && modifiers.meta && !modifiers.shift) {
          const assignedNodeId = bufferDoc.value.assignedNodeId;
          if (!assignedNodeId) return ActionResult.handled({});

          const allBlocks = yield* getAllVisibleBlocks(
            Id.Node.make(assignedNodeId),
            bufferId,
          );
          if (allBlocks.length > 0) {
            yield* Buffer.setBlockSelection(
              bufferId,
              allBlocks,
              allBlocks[0]!,
              allBlocks[allBlocks.length - 1],
            );
          }
          return ActionResult.handled({});
        }

        // --- Copy (Mod+C): Copy selected blocks ---
        if (key === "c" && modifiers.meta && !modifiers.shift) {
          const texts: string[] = [];
          for (const nodeId of selectedBlocks) {
            texts.push(yield* Automerge.getText(nodeId));
          }
          const clipboardText = texts.join("\n\n");
          // Fire-and-forget clipboard write (async but we don't wait)
          void navigator.clipboard.writeText(clipboardText);
          return ActionResult.handled({});
        }

        // --- Cut (Mod+X): Copy and delete selected blocks ---
        if (key === "x" && modifiers.meta && !modifiers.shift) {
          const texts: string[] = [];
          for (const nodeId of selectedBlocks) {
            texts.push(yield* Automerge.getText(nodeId));
          }
          const clipboardText = texts.join("\n\n");
          // Fire-and-forget clipboard write (async but we don't wait)
          void navigator.clipboard.writeText(clipboardText);

          // Delete blocks (in reverse order) and track focus from first deletion
          return yield* deleteSelectedBlocks(bufferId, selectedBlocks);
        }

        // --- Delete/Backspace: Delete selected blocks ---
        if (
          (key === "Delete" || key === "Backspace") &&
          !modifiers.meta &&
          !modifiers.shift
        ) {
          return yield* deleteSelectedBlocks(bufferId, selectedBlocks);
        }

        // --- Force Delete (Cmd+Shift+Backspace): Delete with all children ---
        if (key === "Backspace" && modifiers.meta && modifiers.shift) {
          return yield* deleteSelectedBlocks(bufferId, selectedBlocks);
        }

        // --- Move operations (Alt+Cmd+Arrow) ---
        if (
          (key === "ArrowUp" || key === "ArrowDown") &&
          modifiers.alt &&
          modifiers.meta &&
          selectedBlocks.length > 0
        ) {
          const moveAction =
            key === "ArrowUp"
              ? modifiers.shift
                ? "first"
                : "swapUp"
              : modifiers.shift
                ? "last"
                : "swapDown";

          // For single block, use regular swap
          if (selectedBlocks.length === 1) {
            const nodeId = selectedBlocks[0]!;
            yield* Match.value(moveAction).pipe(
              Match.when("swapUp", () => Buffer.swap(nodeId, "up")),
              Match.when("swapDown", () => Buffer.swap(nodeId, "down")),
              Match.when("first", () => Buffer.moveToFirst(nodeId)),
              Match.when("last", () => Buffer.moveToLast(nodeId)),
              Match.exhaustive,
            );
          } else {
            // Multiple blocks: move as group
            if (moveAction === "swapUp" || moveAction === "first") {
              // Move top block, others follow
              const topBlock = selectedBlocks[0]!;
              if (moveAction === "first") {
                yield* Buffer.moveToFirst(topBlock);
              } else {
                yield* Buffer.swap(topBlock, "up");
              }
            } else {
              // Move bottom block, others follow
              const bottomBlock = selectedBlocks[selectedBlocks.length - 1]!;
              if (moveAction === "last") {
                yield* Buffer.moveToLast(bottomBlock);
              } else {
                yield* Buffer.swap(bottomBlock, "down");
              }
            }
          }

          // Re-apply selection
          yield* Buffer.setBlockSelection(
            bufferId,
            selectedBlocks,
            blockSelectionAnchor!,
            blockSelectionFocus,
          );
          return ActionResult.handled({});
        }

        return ActionResult.notHandled();
      }),
    );

  return {
    handleDocumentAction,
  };
};
