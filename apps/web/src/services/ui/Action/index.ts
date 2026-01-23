/**
 * ActionT - Central action handler for ALL user interactions.
 *
 * Single entry point that receives primitive actions from components,
 * interprets them based on model state, and returns ActionResult with
 * DOMIntent for the component to execute.
 *
 * All action handling is SYNCHRONOUS (runSync) because keyboard events
 * require synchronous preventDefault().
 */

import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT } from "@/services/ui/Buffer";
import { EditorModeT, type EditorMode } from "@/services/ui/EditorMode";
import { NavigationT } from "@/services/ui/Navigation";
import { PickerT, type PickerState } from "@/services/ui/Picker";
import { TitleT } from "@/services/ui/Title";
import { TypePickerT } from "@/services/ui/TypePicker";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Context, Effect, Layer, Match, Option } from "effect";
import { ActionResult, type AppAction, type CursorContext } from "./types";

// Re-export types for convenience
export * from "./types";

/**
 * Create a dispatch function bound to a runtime.
 * Curried: runtime → action → result
 */
export const createDispatch =
  (runtime: { runSync: <A, E>(effect: Effect.Effect<A, E, ActionT>) => A }) =>
  (action: AppAction) =>
    runtime.runSync(
      Effect.gen(function* () {
        const Action = yield* ActionT;
        return yield* Action.handle(action);
      }),
    );

export class ActionT extends Context.Tag("ActionT")<
  ActionT,
  {
    /**
     * Handle a primitive action from a component.
     * Returns ActionResult indicating whether the action was handled
     * and any DOM operations to perform.
     *
     * MUST be called with runSync for keyboard events to allow preventDefault.
     */
    handle: (action: AppAction) => Effect.Effect<ActionResult>;
  }
>() {}

/**
 * Context for action interpretation.
 * Built from source + model state lookups.
 */
interface InterpretContext {
  /** Parsed source information */
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  blockId: Id.Block;
  /** Whether this is the title (nodeId == buffer's assignedNodeId) */
  isTitle: boolean;
  /** Active type definitions for this block */
  activeDefinitions: readonly BlockType.BlockTypeDefinition[];
  /** Whether picker is open for this block */
  pickerOpen: boolean;
  /** Picker state if open */
  pickerState: PickerState | null;
  /** Whether block is expanded */
  isExpanded: boolean;
  /** Current editor mode */
  mode: EditorMode;
}

export const ActionLive = Layer.effect(
  ActionT,
  Effect.gen(function* () {
    // Capture all dependencies
    const EditorMode = yield* EditorModeT;
    const Buffer = yield* BufferT;
    const Block = yield* BlockT;
    const Node = yield* NodeT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Picker = yield* PickerT;
    const Title = yield* TitleT;
    const TypePicker = yield* TypePickerT;
    const Window = yield* WindowT;
    const Automerge = yield* AutomergeT;
    const Store = yield* StoreT;
    const Navigation = yield* NavigationT;

    // Suppress unused variable warnings - these are used by BlockType calls
    void Tuple;

    /**
     * Wrapper that catches all errors and returns notHandled.
     * This ensures all action handlers have the same return type.
     * Requirements are erased because we're inside the layer where all services are available.
     */
    const safe = (
      effect: Effect.Effect<ActionResult, unknown, unknown>,
    ): Effect.Effect<ActionResult> =>
      effect.pipe(
        Effect.catchAll(() => Effect.succeed(ActionResult.notHandled())),
      ) as Effect.Effect<ActionResult>;

    // ========================================================================
    // Main handler
    // ========================================================================

    const handle = (action: AppAction): Effect.Effect<ActionResult> =>
      Effect.gen(function* () {
        // Log incoming action
        const actionSummary = summarizeAction(action);
        yield* Effect.logDebug("[ActionT] Received").pipe(
          Effect.annotateLogs(actionSummary),
        );

        // Get current mode
        const mode = yield* EditorMode.get();

        // Focus action has its own shape (no ActionSource)
        if (action._tag === "Focus") {
          const result = yield* handleFocusAction(
            action.blockId,
            action.offset,
          );
          yield* logResult(action._tag, result);
          return result;
        }

        // Route based on source type
        if (action.source.type === "document") {
          // Document-level action (block selection mode)
          const result = yield* handleDocumentAction(
            action,
            mode,
            action.source.bufferId,
          );
          yield* logResult(action._tag, result);
          return result;
        }

        if (action.source.type === "activation") {
          // Initial activation click - no cursor context yet
          const { blockId } = action.source;
          const ctx = yield* buildContext(blockId, mode);

          if (action._tag === "Click") {
            const result = yield* handleClick(ctx);
            yield* logResult(action._tag, result);
            return result;
          }
          // Other actions require cursor context
          return ActionResult.notHandled();
        }

        // Editor-sourced action (has cursor context)
        const { blockId, cursor } = action.source;
        const ctx = yield* buildContext(blockId, mode);

        // Interpret based on action type
        const result = yield* Match.value(action._tag).pipe(
          Match.when("KeyDown", () =>
            interpretKeyDown(
              action as AppAction & { _tag: "KeyDown" },
              cursor,
              ctx,
            ),
          ),
          Match.when("SelectionChange", () =>
            handleSelectionChange(
              action as AppAction & { _tag: "SelectionChange" },
              ctx,
            ),
          ),
          Match.when("Blur", () => handleBlur(ctx)),
          Match.when("Click", () => handleClick(ctx)),
          Match.exhaustive,
        );

        yield* logResult(action._tag, result);
        return result;
      }).pipe(
        // Catch all errors and return not-handled to let native behavior proceed
        Effect.catchAll(() => Effect.succeed(ActionResult.notHandled())),
      );

    /** Summarize action for logging */
    const summarizeAction = (action: AppAction) => {
      const base: Record<string, unknown> = { action: action._tag };

      if (action._tag === "Focus") {
        return {
          ...base,
          blockId: action.blockId,
          offset: action.offset ?? null,
        };
      }

      base.sourceType = action.source.type;

      if (
        action.source.type === "editor" ||
        action.source.type === "activation"
      ) {
        base.blockId = action.source.blockId;
      }
      if (action.source.type === "document") {
        base.bufferId = action.source.bufferId;
      }

      if (action._tag === "KeyDown") {
        base.key = action.key;
        const mods = [];
        if (action.modifiers.meta) mods.push("meta");
        if (action.modifiers.ctrl) mods.push("ctrl");
        if (action.modifiers.alt) mods.push("alt");
        if (action.modifiers.shift) mods.push("shift");
        if (mods.length > 0) base.modifiers = mods.join("+");
      }

      if (action._tag === "SelectionChange") {
        base.selection = `${action.selection.anchor}-${action.selection.head}`;
      }

      return base;
    };

    /** Log action result */
    const logResult = (tag: string, result: ActionResult) =>
      Effect.logDebug("[ActionT] Result").pipe(
        Effect.annotateLogs({
          action: tag,
          handled: result.handled,
          ...(result.handled && result.intent.focus
            ? { focusType: result.intent.focus.type }
            : {}),
        }),
      );

    // ========================================================================
    // Context building
    // ========================================================================

    const buildContext = (
      blockId: Id.Block,
      mode: EditorMode,
    ): Effect.Effect<InterpretContext> =>
      Effect.gen(function* () {
        const blockContext = Id.parseBlockContextSync(blockId);
        const bufferId = blockContext.bufferId;
        const nodeId =
          blockContext.type === "buffer"
            ? blockContext.nodeId
            : blockContext.hostNodeId;

        // Check if this is the title (nodeId matches buffer's assignedNodeId)
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const assignedNodeId = Option.isSome(bufferDoc)
          ? bufferDoc.value.assignedNodeId
          : null;
        const isTitle = nodeId === assignedNodeId;

        const activeTypes = yield* Type.getTypes(nodeId);
        const activeDefinitions = activeTypes
          .map(BlockType.get)
          .filter((d): d is BlockType.BlockTypeDefinition => d != null);

        const pickerState = yield* Picker.getState();
        const pickerOpen = pickerState?.elementId === blockId;

        const isExpanded = yield* Block.isExpanded(blockId);

        return {
          bufferId,
          nodeId,
          blockId,
          isTitle,
          activeDefinitions,
          pickerOpen,
          pickerState,
          isExpanded,
          mode,
        };
      });

    // ========================================================================
    // KeyDown interpretation
    // ========================================================================

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
            yield* EditorMode.enterBlockSelection(bufferId);
            yield* Window.setActiveElement(
              Option.some({ type: "buffer" as const, id: bufferId }),
            );
            yield* Buffer.setSelection(bufferId, Option.none());
            yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);

            return ActionResult.handled({ focus: { type: "none" } });
          }

          // --- Arrow navigation at boundaries ---
          if (key === "ArrowLeft" && cursor.atStart && !modifiers.shift) {
            return yield* handleArrowLeftAtStart(ctx);
          }

          if (key === "ArrowRight" && cursor.atEnd && !modifiers.shift) {
            return yield* handleArrowRightAtEnd(ctx);
          }

          if (
            key === "ArrowUp" &&
            cursor.lineInfo.atFirstLine &&
            !modifiers.shift &&
            !modifiers.meta
          ) {
            return yield* handleArrowUpOnFirstLine(
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
            return yield* handleArrowDownOnLastLine(
              ctx,
              cursor.goalX ?? cursor.coords?.x ?? 0,
            );
          }

          // --- Block select (Shift+Arrow at boundary) ---
          // Match legacy TextEditor keymaps: headAtStart / headAtEnd conditions
          // Exclude alt+meta to not interfere with Move shortcuts
          const docLen = cursor.docText.length;

          if (
            key === "ArrowUp" &&
            modifiers.shift &&
            !modifiers.alt &&
            cursor.lineInfo.atFirstLine &&
            cursor.head === 0 // headAtStart
          ) {
            return yield* enterBlockSelectionWithExtend(ctx, "up");
          }

          if (
            key === "ArrowDown" &&
            modifiers.shift &&
            !modifiers.alt &&
            cursor.lineInfo.atLastLine &&
            cursor.head === docLen // headAtEnd
          ) {
            return yield* enterBlockSelectionWithExtend(ctx, "down");
          }

          // --- Zoom In/Out (Cmd+.) ---
          if (key === "." && modifiers.meta) {
            yield* Navigation.navigateTo(nodeId);
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
            return yield* handleZoomOut(ctx);
          }

          // --- Move (Alt+Cmd+Arrow) ---
          if (key === "ArrowUp" && modifiers.alt && modifiers.meta) {
            return yield* handleMove(ctx, modifiers.shift ? "first" : "swapUp");
          }

          if (key === "ArrowDown" && modifiers.alt && modifiers.meta) {
            return yield* handleMove(
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
                const bufferDoc = yield* Store.getDocument("buffer", bufferId);
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
                  const parentBlockId = Id.makeBufferBlockId(
                    bufferId,
                    parentId,
                  );
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

    // ========================================================================
    // Arrow navigation helpers
    // ========================================================================

    const handleArrowLeftAtStart = (
      ctx: InterpretContext,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId } = ctx;

          const bufferDoc = yield* Store.getDocument("buffer", bufferId);
          const rootNodeId = Option.isSome(bufferDoc)
            ? bufferDoc.value.assignedNodeId
            : null;

          const targetOpt = yield* Block.findPreviousNode(nodeId, bufferId);
          if (Option.isNone(targetOpt)) {
            return ActionResult.handled({});
          }

          const targetNodeId = targetOpt.value;
          const targetText = yield* Automerge.getText(targetNodeId);
          const endPos = targetText.length;
          const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, endPos),
          );

          // Title is just a block - use the same activeElement type
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );

          if (targetNodeId === rootNodeId) {
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            return ActionResult.handled({
              focus: {
                type: "block",
                blockId: targetBlockId,
                selection: { anchor: endPos, head: endPos },
              },
            });
          }
        }),
      );

    const handleArrowRightAtEnd = (
      ctx: InterpretContext,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId, isExpanded } = ctx;

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
            return ActionResult.handled({
              focus: {
                type: "block",
                blockId: targetBlockId,
                selection: { anchor: 0, head: 0 },
              },
            });
          }

          // Find next node in document order
          const nextNodeOpt = yield* Block.findNextNode(nodeId);
          if (Option.isNone(nextNodeOpt)) {
            return ActionResult.handled({});
          }

          const nextNodeId = nextNodeOpt.value;
          const targetBlockId = Id.makeBufferBlockId(bufferId, nextNodeId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, 0),
          );
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );
          return ActionResult.handled({
            focus: {
              type: "block",
              blockId: targetBlockId,
              selection: { anchor: 0, head: 0 },
            },
          });
        }),
      );

    const handleArrowUpOnFirstLine = (
      ctx: InterpretContext,
      cursorGoalX: number,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId } = ctx;

          // Preserve existing goalX if set
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
          if (Option.isNone(targetOpt)) {
            return ActionResult.handled({});
          }

          const targetNodeId = targetOpt.value;
          const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);
          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, 0, {
              goalX,
              goalLine: "last",
            }),
          );

          // Title is just a block - use the same activeElement type
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: targetBlockId }),
          );

          if (targetNodeId === rootNodeId) {
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            return ActionResult.handled({
              focus: { type: "block", blockId: targetBlockId },
            });
          }
        }),
      );

    const handleArrowDownOnLastLine = (
      ctx: InterpretContext,
      cursorGoalX: number,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId, blockId, isExpanded } = ctx;

          // Preserve existing goalX if set
          const existingSelection = yield* Buffer.getSelection(bufferId);
          const goalX =
            Option.isSome(existingSelection) &&
            existingSelection.value.goalX != null
              ? existingSelection.value.goalX
              : cursorGoalX;

          // If has visible children (expanded), go to first child
          const children = yield* Node.getNodeChildren(nodeId);
          if (children.length > 0 && isExpanded) {
            const firstChildId = children[0]!;
            const targetBlockId = Id.makeBufferBlockId(bufferId, firstChildId);
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
            return ActionResult.handled({
              focus: { type: "block", blockId: targetBlockId },
            });
          }

          // Find next node in document order
          const nextNodeOpt = yield* Block.findNextNode(nodeId);
          if (Option.isNone(nextNodeOpt)) {
            // No next block - stay at current position
            const text = yield* Automerge.getText(nodeId);
            yield* Buffer.setSelection(
              bufferId,
              makeCollapsedSelection(blockId, text.length),
            );
            return ActionResult.handled({});
          }

          const nextNodeId = nextNodeOpt.value;
          const targetBlockId = Id.makeBufferBlockId(bufferId, nextNodeId);
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
          return ActionResult.handled({
            focus: { type: "block", blockId: targetBlockId },
          });
        }),
      );

    // ========================================================================
    // Block selection mode entry
    // ========================================================================

    const enterBlockSelectionWithExtend = (
      ctx: InterpretContext,
      _direction: "up" | "down",
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId } = ctx;

          yield* EditorMode.enterBlockSelection(bufferId);
          yield* Window.setActiveElement(
            Option.some({ type: "buffer" as const, id: bufferId }),
          );
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);

          // TODO: extend selection in _direction

          return ActionResult.handled({ focus: { type: "none" } });
        }),
      );

    // ========================================================================
    // Zoom out
    // ========================================================================

    const handleZoomOut = (
      ctx: InterpretContext,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId } = ctx;

          const bufferDoc = yield* Store.getDocument("buffer", bufferId);
          if (Option.isNone(bufferDoc) || !bufferDoc.value.assignedNodeId) {
            return ActionResult.handled({});
          }

          const rootNodeId = Id.Node.make(bufferDoc.value.assignedNodeId);
          const parentId = yield* Node.getParent(rootNodeId).pipe(
            Effect.catchTag("NodeHasNoParentError", () =>
              Effect.succeed<Id.Node | null>(null),
            ),
          );

          if (!parentId) {
            return ActionResult.handled({});
          }

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

          return ActionResult.handled({
            focus: { type: "block", blockId: targetBlockId },
          });
        }),
      );

    // ========================================================================
    // Move actions
    // ========================================================================

    const handleMove = (
      ctx: InterpretContext,
      moveAction: "swapUp" | "swapDown" | "first" | "last",
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, nodeId, blockId } = ctx;

          // For swap actions, check if at buffer boundary
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
              const bufferDoc = yield* Store.getDocument(
                "buffer",
                bufferId,
              ).pipe(Effect.orDie);
              const assignedNodeId = Option.match(bufferDoc, {
                onNone: () => null,
                onSome: (doc) => doc.assignedNodeId,
              });
              if (parentId === assignedNodeId) {
                return ActionResult.handled({});
              }
            }
          }

          const moved = yield* Match.value(moveAction).pipe(
            Match.when("swapUp", () => Buffer.swap(nodeId, "up")),
            Match.when("swapDown", () => Buffer.swap(nodeId, "down")),
            Match.when("first", () => Buffer.moveToFirst(nodeId)),
            Match.when("last", () => Buffer.moveToLast(nodeId)),
            Match.exhaustive,
          );

          if (moved) {
            // Re-set selection to trigger ancestor expansion
            const selection = yield* Buffer.getSelection(bufferId);
            yield* Buffer.setSelection(bufferId, selection);
          }

          return ActionResult.handled({
            focus: { type: "block", blockId },
          });
        }),
      );

    // ========================================================================
    // Helper functions
    // ========================================================================

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

    // ========================================================================
    // Other action handlers
    // ========================================================================

    const handleSelectionChange = (
      action: AppAction & { _tag: "SelectionChange" },
      ctx: InterpretContext,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, blockId } = ctx;
          const { selection } = action;

          yield* Buffer.setSelection(
            bufferId,
            Option.some({
              anchor: { elementId: blockId },
              anchorOffset: selection.anchor,
              focus: { elementId: blockId },
              focusOffset: selection.head,
              goalX: null,
              goalLine: null,
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

          // Check if blur should be skipped (atomic transition)
          const skip = yield* EditorMode.shouldSkipBlur();
          if (skip) {
            yield* Effect.logDebug(
              "[Action.Blur] Skipped (atomic transition)",
            ).pipe(Effect.annotateLogs({ blockId, bufferId }));
            return ActionResult.handled({});
          }

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
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const blockContext = Id.parseBlockContextSync(blockId);
          const bufferId = blockContext.bufferId;
          const nodeId =
            blockContext.type === "buffer"
              ? blockContext.nodeId
              : blockContext.hostNodeId;

          // Skip blur handling during focus transition to prevent race condition
          // where blur fires before DOM focus is established
          yield* EditorMode.withSkipBlur();

          // Set selection if offset provided
          if (offset !== undefined) {
            yield* Buffer.setSelection(
              bufferId,
              makeCollapsedSelection(blockId, offset),
            );
          }

          // Clear block selection when entering text editing mode
          yield* Buffer.setBlockSelection(bufferId, [], nodeId);
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: blockId }),
          );
          yield* EditorMode.set({ type: "block", blockId });

          yield* Effect.logDebug("[Action.Focus] Block activated").pipe(
            Effect.annotateLogs({
              blockId,
              offset: offset ?? null,
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

    // ========================================================================
    // Document-level actions (block selection mode)
    // ========================================================================

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

          const { selectedBlocks, blockSelectionAnchor, blockSelectionFocus } =
            bufferDoc.value;

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
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: blockId }),
            );
            yield* EditorMode.set({ type: "block", blockId });

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
                    const titleBlockId = Id.makeBufferBlockId(
                      bufferId,
                      parentId,
                    );
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

    const handleBlockSelectionArrow = (
      bufferId: Id.Buffer,
      direction: "up" | "down",
      shift: boolean,
      _selectedBlocks: readonly Id.Node[],
      blockSelectionAnchor: Id.Node | null,
      blockSelectionFocus: Id.Node | null,
    ): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          if (!blockSelectionAnchor) {
            return ActionResult.handled({});
          }

          const currentFocus = blockSelectionFocus ?? blockSelectionAnchor;

          if (shift) {
            // Extend selection
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
            if (_selectedBlocks.length > 1) {
              // Find topmost/bottommost in document order
              const targetNodeId =
                direction === "up"
                  ? _selectedBlocks[0] // First in array is topmost
                  : _selectedBlocks[_selectedBlocks.length - 1]; // Last is bottommost

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
              // ArrowUp at first block: return notHandled so legacy can scroll to top
              // ArrowDown at last block: do nothing
              if (direction === "up") {
                return ActionResult.notHandled();
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

    // ========================================================================
    // Block selection helpers
    // ========================================================================

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

    return { handle };
  }),
);
