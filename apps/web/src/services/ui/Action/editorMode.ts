/**
 * Editor Mode Handlers for ActionT.
 *
 * All keyboard/event handling when cursor is in a Editor:
 * - interpretKeyDown (main keyboard dispatcher)
 * - handleSelectionChange, handleBlur, handleFocusAction, handleClick
 */

import { Id } from "@/schema";
import * as BlockType from "@/services/ui/BlockType";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import type { NavigationHandlers } from "./navigation";
import {
  ActionResult,
  type ActionDeps,
  type AppAction,
  type CursorContext,
  type InterpretContext,
  type SafeWrapper,
} from "./types";

export interface EditorModeHandlers {
  interpretKeyDown: (
    action: AppAction & { _tag: "KeyDown" },
    cursor: CursorContext,
    ctx: InterpretContext,
  ) => Effect.Effect<ActionResult>;
  handleSelectionChange: (
    action: AppAction & { _tag: "SelectionChange" },
    ctx: InterpretContext,
  ) => Effect.Effect<ActionResult>;
  handleBlur: (ctx: InterpretContext) => Effect.Effect<ActionResult>;
  handleFocusAction: (
    blockId: Id.Block,
    offset?: number,
    assoc?: -1 | 1,
  ) => Effect.Effect<ActionResult>;
  handleClick: (ctx: InterpretContext) => Effect.Effect<ActionResult>;
}

export const createEditorModeHandlers = (
  deps: ActionDeps,
  nav: NavigationHandlers,
  safe: SafeWrapper,
): EditorModeHandlers => {
  const { Buffer, Block, Node, Type, Picker, Title, TypePicker, Window } = deps;

  const getFirstAvailableType = (query: string): Effect.Effect<Id.Node> =>
    Effect.gen(function* () {
      const types = yield* TypePicker.getAvailableTypes();
      const filtered = TypePicker.filterTypes(types, query);
      if (filtered.length > 0) {
        return filtered[0]!.id;
      }
      // Create new type if no match
      return yield* TypePicker.createType(query);
    });

  const interpretKeyDown = (
    action: AppAction & { _tag: "KeyDown" },
    cursor: CursorContext,
    ctx: InterpretContext,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { key, modifiers } = action;
        const { bufferId, nodeId, blockId, activeDefinitions, pickerOpen } =
          ctx;

        // --- Toggle Todo (Cmd+Enter) ---
        // Must check BEFORE regular Enter to avoid split behavior
        if (key === "Enter" && modifiers.meta && !modifiers.shift) {
          yield* BlockType.toggleCheckbox(nodeId);
          return ActionResult.handled({});
        }

        // --- Enter ---
        if (key === "Enter" && !modifiers.shift && !modifiers.meta) {
          // Picker open? Select item
          if (pickerOpen) {
            yield* Picker.selectType(
              yield* getFirstAvailableType(ctx.pickerState!.query),
            );
            return ActionResult.handled({
              focus: { type: "block", blockId },
            });
          }

          // Title Enter: create first child block
          if (ctx.isTitle) {
            yield* Title.enter(bufferId, nodeId, {
              cursorPos: cursor.position,
              textAfter: cursor.textAfter,
            });
            // Title.enter handles selection and focus
            const children = yield* Node.getNodeChildren(nodeId);
            if (children.length > 0) {
              const newBlockId = Id.makeBufferBlockId(bufferId, children[0]!);
              return ActionResult.handled({
                focus: {
                  type: "block",
                  blockId: newBlockId,
                  selection: { anchor: 0, head: 0 },
                },
                scroll: newBlockId,
              });
            }
            return ActionResult.handled({});
          }

          // Empty block with removable type? Remove type
          if (cursor.atStart && cursor.atEnd) {
            for (const def of activeDefinitions) {
              if (def.enter?.removeOnEmpty) {
                yield* Type.removeType(nodeId, def.id);
                return ActionResult.handled({});
              }
            }
          }

          // Normal: split block
          const result = yield* Buffer.split({
            nodeId,
            cursorPos: cursor.position,
            textAfter: cursor.textAfter,
          });

          // Propagate types
          for (const def of activeDefinitions) {
            if (def.enter?.propagateToNewBlock) {
              yield* Type.addType(result.newNodeId, def.id);
            }
          }

          const newBlockId = Id.makeBufferBlockId(bufferId, result.newNodeId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(newBlockId, result.cursorOffset),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: newBlockId }),
          );

          return ActionResult.handled({
            focus: {
              type: "block",
              blockId: newBlockId,
              selection: {
                anchor: result.cursorOffset,
                head: result.cursorOffset,
              },
            },
            scroll: newBlockId,
          });
        }

        // --- Backspace ---
        // Handle plain Backspace and Cmd+Backspace at start (not Shift which is Force Delete)
        if (key === "Backspace" && !modifiers.shift) {
          // Picker open? Let native handle (delete from query)
          if (pickerOpen) {
            return ActionResult.notHandled();
          }

          // Not at start? Let native handle
          if (!cursor.atStart) {
            return ActionResult.notHandled();
          }

          // Has removable type? Remove it
          for (const def of activeDefinitions) {
            if (def.backspace?.removeTypeAtStart) {
              yield* Type.removeType(nodeId, def.id);
              return ActionResult.handled({});
            }
          }

          // At start, no removable type: merge backward
          const result = yield* Buffer.mergeBackward(bufferId, nodeId);
          if (Option.isNone(result)) {
            return ActionResult.handled({});
          }

          const { targetNodeId, cursorOffset, isTitle } = result.value;
          const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, cursorOffset),
          );

          // Title is just a block - use the same activeElement type
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );

          if (isTitle) {
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            return ActionResult.handled({
              focus: {
                type: "block",
                blockId: targetBlockId,
                selection: { anchor: cursorOffset, head: cursorOffset },
              },
            });
          }
        }

        // --- Delete at end ---
        if (key === "Delete" && cursor.atEnd) {
          const result = yield* Buffer.mergeForward(bufferId, nodeId);
          if (Option.isNone(result)) {
            return ActionResult.handled({});
          }

          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(blockId, result.value.cursorOffset),
          );

          return ActionResult.handled({});
        }

        // --- Force Delete (Cmd+Shift+Backspace) ---
        if (key === "Backspace" && modifiers.meta && modifiers.shift) {
          const result = yield* Buffer.forceDelete(bufferId, nodeId);
          if (Option.isNone(result)) {
            return ActionResult.handled({});
          }

          const { targetNodeId, cursorOffset, isTitle } = result.value;
          const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, cursorOffset),
          );

          // Title is just a block - use the same activeElement type
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );

          if (isTitle) {
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            return ActionResult.handled({
              focus: {
                type: "block",
                blockId: targetBlockId,
                selection: { anchor: cursorOffset, head: cursorOffset },
              },
            });
          }
        }

        // --- Tab ---
        if (
          key === "Tab" &&
          !modifiers.meta &&
          !modifiers.ctrl &&
          !modifiers.alt
        ) {
          if (modifiers.shift) {
            yield* Buffer.outdent(bufferId, [nodeId]);
          } else {
            yield* Buffer.indent([nodeId]);
          }
          // Re-set selection to trigger ancestor expansion
          const selection = yield* Buffer.getSelection(bufferId);
          yield* Buffer.setSelection(bufferId, selection);
          return ActionResult.handled({});
        }

        // --- Escape ---
        if (key === "Escape") {
          if (pickerOpen) {
            yield* Picker.close();
            return ActionResult.handled({});
          }

          // Enter block selection mode
          yield* Buffer.enterBlockSelection(bufferId);
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);

          // Focus the Buffer container to receive keyboard events
          yield* Effect.sync(() => {
            const container = document.querySelector(
              `[data-buffer-id="${bufferId}"]`,
            );
            (container as HTMLElement | null)?.focus();
          });

          return ActionResult.handled({ focus: { type: "none" } });
        }

        // --- Arrow navigation at boundaries ---
        if (key === "ArrowLeft" && cursor.atStart && !modifiers.shift) {
          return yield* nav.handleArrowLeftAtStart(ctx);
        }

        if (key === "ArrowRight" && cursor.atEnd && !modifiers.shift) {
          return yield* nav.handleArrowRightAtEnd(ctx);
        }

        // --- Clear goalX on horizontal navigation ---
        // Any horizontal movement (ArrowLeft/Right, with or without modifiers)
        // should reset goalX so subsequent vertical navigation starts fresh.
        if (key === "ArrowLeft" || key === "ArrowRight") {
          const existingSel = yield* Buffer.getSelection(bufferId);
          if (Option.isSome(existingSel) && existingSel.value.goalX != null) {
            yield* Buffer.setSelection(
              bufferId,
              Option.some({
                ...existingSel.value,
                goalX: null,
                goalLine: null,
              }),
            );
          }
          return ActionResult.notHandled();
        }

        if (
          key === "ArrowUp" &&
          cursor.lineInfo.atFirstLine &&
          !modifiers.shift &&
          !modifiers.meta
        ) {
          return yield* nav.handleArrowUpOnFirstLine(
            ctx,
            cursor.goalX ?? cursor.coords?.x ?? 0,
          );
        }

        if (
          key === "ArrowDown" &&
          cursor.lineInfo.atLastLine &&
          !modifiers.shift &&
          !modifiers.meta
        ) {
          return yield* nav.handleArrowDownOnLastLine(
            ctx,
            cursor.goalX ?? cursor.coords?.x ?? 0,
          );
        }

        // --- Block select (Shift+Arrow at boundary) ---
        // Match legacy Editor keymaps: headAtStart / headAtEnd conditions
        // Exclude alt+meta to not interfere with Move shortcuts
        const docLen = cursor.docText.length;

        if (
          key === "ArrowUp" &&
          modifiers.shift &&
          !modifiers.alt &&
          cursor.lineInfo.atFirstLine &&
          cursor.head === 0 // headAtStart
        ) {
          return yield* nav.enterBlockSelectionWithExtend(ctx, "up");
        }

        if (
          key === "ArrowDown" &&
          modifiers.shift &&
          !modifiers.alt &&
          cursor.lineInfo.atLastLine &&
          cursor.head === docLen // headAtEnd
        ) {
          return yield* nav.enterBlockSelectionWithExtend(ctx, "down");
        }

        // --- Zoom In/Out (Cmd+.) ---
        if (key === "." && modifiers.meta) {
          yield* deps.Navigation.navigateTo(nodeId);
          // After navigation, nodeId is the new title
          const titleBlockId = Id.makeBufferBlockId(bufferId, nodeId);
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: titleBlockId }),
          );
          return ActionResult.handled({
            focus: { type: "title", bufferId },
          });
        }

        if (key === "," && modifiers.meta) {
          return yield* nav.handleZoomOut(ctx);
        }

        // --- Move (Alt+Cmd+Arrow) ---
        if (key === "ArrowUp" && modifiers.alt && modifiers.meta) {
          return yield* nav.handleMove(
            ctx,
            modifiers.shift ? "first" : "swapUp",
          );
        }

        if (key === "ArrowDown" && modifiers.alt && modifiers.meta) {
          return yield* nav.handleMove(
            ctx,
            modifiers.shift ? "last" : "swapDown",
          );
        }

        // --- Collapse / Navigate to parent (Cmd+ArrowUp) ---
        if (key === "ArrowUp" && modifiers.meta && !modifiers.alt) {
          const children = yield* Node.getNodeChildren(nodeId);

          if (children.length > 0 && ctx.isExpanded) {
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
              const bufferDoc = yield* deps.Store.getDocument(
                "buffer",
                bufferId,
              );
              const assignedNodeId = Option.isSome(bufferDoc)
                ? bufferDoc.value.assignedNodeId
                : null;

              if (parentId === assignedNodeId) {
                // Parent is title: focus title
                const titleBlockId = Id.makeBufferBlockId(bufferId, parentId);
                yield* Window.setActiveElement(
                  Option.some({ type: "block" as const, id: titleBlockId }),
                );
                return ActionResult.handled({
                  focus: { type: "title", bufferId },
                });
              } else {
                // Navigate to parent block
                const parentBlockId = Id.makeBufferBlockId(bufferId, parentId);
                yield* Buffer.setSelection(
                  bufferId,
                  makeCollapsedSelection(parentBlockId, 0),
                );
                yield* Window.setActiveElement(
                  Option.some({ type: "block" as const, id: parentBlockId }),
                );
                return ActionResult.handled({
                  focus: { type: "block", blockId: parentBlockId },
                });
              }
            }
          }
          return ActionResult.handled({});
        }

        // --- Expand (Cmd+ArrowDown) ---
        if (key === "ArrowDown" && modifiers.meta && !modifiers.alt) {
          yield* Block.expandOneLevel(bufferId, nodeId);
          return ActionResult.handled({});
        }

        // Not handled - let native behavior proceed
        return ActionResult.notHandled();
      }),
    );

  const handleSelectionChange = (
    action: AppAction & { _tag: "SelectionChange" },
    ctx: InterpretContext,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, blockId } = ctx;
        const { selection } = action;

        // Preserve goalX/goalLine if they exist in the current selection.
        // This allows goalX to survive across multiple arrow key presses
        // through shorter blocks (e.g., block A -> short block B -> block C
        // should preserve the original goalX from block A).
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const existingGoalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : null;
        const existingGoalLine =
          existingGoalX != null && Option.isSome(existingSelection)
            ? existingSelection.value.goalLine
            : null;

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { elementId: blockId },
            anchorOffset: selection.anchor,
            focus: { elementId: blockId },
            focusOffset: selection.head,
            goalX: existingGoalX,
            goalLine: existingGoalLine,
            assoc: selection.assoc,
          }),
        );

        return ActionResult.handled({});
      }),
    );

  const handleBlur = (ctx: InterpretContext): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { bufferId, blockId } = ctx;

        // Only clear selection and activeElement if still pointing to this block
        const selectionOpt = yield* Buffer.getSelection(bufferId);
        const sel = Option.getOrNull(selectionOpt);
        const selBlockId = sel ? sel.anchor.elementId : null;
        if (sel && selBlockId === blockId) {
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Window.setActiveElement(Option.none());
          yield* Effect.logDebug(
            "[Action.Blur] Cleared selection and activeElement",
          ).pipe(Effect.annotateLogs({ blockId, bufferId }));
        } else {
          yield* Effect.logDebug(
            "[Action.Blur] No-op (selection doesn't match)",
          ).pipe(
            Effect.annotateLogs({
              blockId,
              bufferId,
              selBlockId: selBlockId ?? "none",
            }),
          );
        }

        return ActionResult.handled({});
      }),
    );

  /**
   * Handle Focus action - activate a block with optional cursor offset.
   * Does everything in one place: selection, block selection, active element, editor mode.
   */
  const handleFocusAction = (
    blockId: Id.Block,
    offset?: number,
    assoc?: -1 | 1,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const blockContext = Id.parseBlockContextSync(blockId);
        const bufferId = blockContext.bufferId;
        const nodeId =
          blockContext.type === "buffer"
            ? blockContext.nodeId
            : blockContext.hostNodeId;

        yield* Buffer.setBlockSelection(bufferId, [], nodeId);

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { elementId: blockId },
            anchorOffset: offset ?? 0,
            focus: { elementId: blockId },
            focusOffset: offset ?? 0,
            goalX: null,
            goalLine: null,
            assoc: assoc ?? 0,
          }),
        );

        yield* Effect.forkDaemon(
          Effect.async<void>((resume) => {
            requestAnimationFrame(() => resume(Effect.void));
          }).pipe(
            Effect.andThen(
              Window.setActiveElement(
                Option.some({ type: "block" as const, id: blockId }),
              ),
            ),
          ),
        );

        yield* Effect.logDebug("[Action.Focus] Block activated").pipe(
          Effect.annotateLogs({
            blockId,
            offset: offset ?? null,
            assoc: assoc ?? null,
          }),
        );

        return ActionResult.handled({});
      }),
    );

  const handleClick = (ctx: InterpretContext): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        // Click from editor context - just activate the block
        return yield* handleFocusAction(ctx.blockId);
      }),
    );

  return {
    interpretKeyDown,
    handleSelectionChange,
    handleBlur,
    handleFocusAction,
    handleClick,
  };
};
