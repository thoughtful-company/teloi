/**
 * Editor Mode Handlers for ActionT.
 *
 * All keyboard/event handling when cursor is in a Editor:
 * - interpretKeyDown (main keyboard dispatcher)
 * - handleSelectionChange, handleBlur, handleFocusAction, handleClick
 */

import { mergeBackward } from "@/commands/editor/utils/mergeBackward";
import { mergeForward } from "@/commands/editor/utils/mergeForward";
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
  const { Buffer, Type, Window } = deps;

  const interpretKeyDown = (
    action: AppAction & { _tag: "KeyDown" },
    cursor: CursorContext,
    ctx: InterpretContext,
  ): Effect.Effect<ActionResult> =>
    safe(
      Effect.gen(function* () {
        const { key, modifiers } = action;
        const { bufferId, nodeId, activeDefinitions, pickerOpen } = ctx;

        // --- Toggle Todo (Cmd+Enter) ---
        // Must check BEFORE regular Enter to avoid split behavior
        if (key === "Enter" && modifiers.meta && !modifiers.shift) {
          yield* BlockType.toggleCheckbox(nodeId);
          return ActionResult.handled({});
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
          yield* mergeBackward();
          return ActionResult.handled({});
        }

        // --- Delete at end ---
        if (key === "Delete" && cursor.atEnd) {
          yield* mergeForward();
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
