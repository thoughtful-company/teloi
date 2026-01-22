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
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT } from "@/services/ui/Buffer";
import { EditorModeT, type EditorMode } from "@/services/ui/EditorMode";
import { NavigationT } from "@/services/ui/Navigation";
import { PickerT, type PickerState } from "@/services/ui/Picker";
import { TypePickerT } from "@/services/ui/TypePicker";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Context, Effect, Layer, Match, Option } from "effect";
import { ActionResult, type AppAction, type CursorContext } from "./types";

// Re-export types for convenience
export * from "./types";

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
    const TypePicker = yield* TypePickerT;
    const Window = yield* WindowT;
    const Yjs = yield* YjsT;
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
        // Get current mode
        const mode = yield* EditorMode.get();

        // Route based on source type
        if (action.source.type === "document") {
          // Document-level action (block selection mode)
          return yield* handleDocumentAction(
            action,
            mode,
            action.source.bufferId,
          );
        }

        // Editor-sourced action
        const { blockId, cursor } = action.source;
        const ctx = yield* buildContext(blockId, mode);

        // Interpret based on action type
        return yield* Match.value(action._tag).pipe(
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
          Match.when("Focus", () => handleFocus(ctx)),
          Match.when("Click", () => handleClick(ctx)),
          Match.exhaustive,
        );
      }).pipe(
        // Catch all errors and return not-handled to let native behavior proceed
        Effect.catchAll(() => Effect.succeed(ActionResult.notHandled())),
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

            if (isTitle) {
              yield* Window.setActiveElement(
                Option.some({ type: "title" as const, bufferId }),
              );
              return ActionResult.handled({
                focus: { type: "title", bufferId },
              });
            } else {
              yield* Window.setActiveElement(
                Option.some({ type: "block" as const, id: targetBlockId }),
              );
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

            if (isTitle) {
              yield* Window.setActiveElement(
                Option.some({ type: "title" as const, bufferId }),
              );
              return ActionResult.handled({
                focus: { type: "title", bufferId },
              });
            } else {
              yield* Window.setActiveElement(
                Option.some({ type: "block" as const, id: targetBlockId }),
              );
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
            yield* Window.setActiveElement(
              Option.some({ type: "title" as const, bufferId }),
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
          const targetYtext = Yjs.getText(targetNodeId);
          const endPos = targetYtext.length;
          const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

          yield* Buffer.setSelection(
            bufferId,
            makeCollapsedSelection(targetBlockId, endPos),
          );

          if (targetNodeId === rootNodeId) {
            yield* Window.setActiveElement(
              Option.some({ type: "title" as const, bufferId }),
            );
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: targetBlockId }),
            );
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

          if (targetNodeId === rootNodeId) {
            yield* Window.setActiveElement(
              Option.some({ type: "title" as const, bufferId }),
            );
            return ActionResult.handled({
              focus: { type: "title", bufferId },
            });
          } else {
            yield* Window.setActiveElement(
              Option.some({ type: "block" as const, id: targetBlockId }),
            );
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
            const textLength = Yjs.getText(nodeId).length;
            yield* Buffer.setSelection(
              bufferId,
              makeCollapsedSelection(blockId, textLength),
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
            return ActionResult.handled({});
          }

          // Only clear selection and activeElement if still pointing to this block
          const selectionOpt = yield* Buffer.getSelection(bufferId);
          const sel = Option.getOrNull(selectionOpt);
          const selBlockId = sel ? sel.anchor.elementId : null;
          if (sel && selBlockId === blockId) {
            yield* Buffer.setSelection(bufferId, Option.none());
            yield* Window.setActiveElement(Option.none());
          }

          return ActionResult.handled({});
        }),
      );

    const handleFocus = (ctx: InterpretContext): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          const { bufferId, blockId, nodeId } = ctx;

          // Clear block selection when entering text editing mode
          yield* Buffer.setBlockSelection(bufferId, [], nodeId);
          yield* Window.setActiveElement(
            Option.some({ type: "block" as const, id: blockId }),
          );
          yield* EditorMode.set({ type: "block", blockId });

          return ActionResult.handled({});
        }),
      );

    const handleClick = (ctx: InterpretContext): Effect.Effect<ActionResult> =>
      safe(
        Effect.gen(function* () {
          // Click is just a focus trigger in most cases
          return yield* handleFocus(ctx);
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

            const text = Yjs.getText(targetBlock).toString();
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

    return { handle };
  }),
);
