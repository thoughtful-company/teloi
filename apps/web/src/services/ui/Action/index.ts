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
import { KeyboardT } from "@/services/browser/Keyboard";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT, type EditorMode } from "@/services/ui/Buffer";
import { NavigationT } from "@/services/ui/Navigation";
import { PickerT } from "@/services/ui/Picker";
import { TitleT } from "@/services/ui/Title";
import { TypePickerT } from "@/services/ui/TypePicker";
import { WindowT } from "@/services/ui/Window";
import { Context, Effect, Layer, Match, Option, Stream } from "effect";

import { EditBlock, Indent, Outdent } from "@/commands/buffer";
import { CommandBusT } from "@/services/ui/CommandBus";
import { KeyEventBusT } from "@/services/ui/KeyEventBus";
import { createBlockSelectionHandlers } from "./blockSelection";
import { createEditorModeHandlers } from "./editorMode";
import { createNavigationHandlers } from "./navigation";
import {
  ActionResult,
  type ActionDeps,
  type AppAction,
  type InterpretContext,
} from "./types";

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

/**
 * Callbacks for app-level shortcuts.
 * These are UI actions that ActionT shouldn't own directly.
 */
export interface AppShortcutCallbacks {
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
}

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

    /**
     * Start the unified keyboard handler.
     * Consumes window keyboard events and routes them appropriately:
     * - App shortcuts (Cmd+K, Cmd+\) → callbacks
     * - Block selection mode → handle()
     *
     * Returns a long-running Effect - run with runFork.
     */
    runKeyboardHandler: (
      callbacks: AppShortcutCallbacks,
    ) => Effect.Effect<void>;
  }
>() {}

export const ActionLive = Layer.effect(
  ActionT,
  Effect.gen(function* () {
    // Capture all dependencies
    const Keyboard = yield* KeyboardT;
    const Buffer = yield* BufferT;
    const Block = yield* BlockT;
    const Node = yield* NodeT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const Title = yield* TitleT;
    const TypePicker = yield* TypePickerT;
    const Window = yield* WindowT;
    const Automerge = yield* AutomergeT;
    const Store = yield* StoreT;
    const Navigation = yield* NavigationT;
    const CommandBus = yield* CommandBusT;
    const KeyEventBus = yield* KeyEventBusT;

    // Build deps object for handler modules
    const deps: ActionDeps = {
      Keyboard,
      Buffer,
      Block,
      Node,
      Type,
      Picker,
      Title,
      TypePicker,
      Window,
      Automerge,
      Store,
      Navigation,
    };

    /**
     * Wrapper that catches all errors and returns notHandled.
     * This ensures all action handlers have the same return type.
     * Requirements are erased because we're inside the layer where all services are available.
     */
    const safe = <A>(
      effect: Effect.Effect<A, unknown, unknown>,
    ): Effect.Effect<A> =>
      effect.pipe(
        Effect.catchAll(() => Effect.succeed(ActionResult.notHandled() as A)),
      ) as Effect.Effect<A>;

    // Initialize handler modules
    const nav = createNavigationHandlers(deps, safe);
    const editor = createEditorModeHandlers(deps, nav, safe);
    const blockSel = createBlockSelectionHandlers(deps, nav, safe);

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
    // Logging utilities
    // ========================================================================

    /** Summarize action for logging */
    const summarizeAction = (action: AppAction) => {
      const base: Record<string, unknown> = { action: action._tag };

      if (action._tag === "Focus") {
        return {
          ...base,
          blockId: action.blockId,
          offset: action.offset ?? null,
          assoc: action.assoc ?? null,
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
        const mode = yield* Buffer.getMode();

        // Focus action has its own shape (no ActionSource)
        if (action._tag === "Focus") {
          const result = yield* editor.handleFocusAction(
            action.blockId,
            action.offset,
            action.assoc,
          );
          yield* logResult(action._tag, result);
          return result;
        }

        // Route based on source type
        if (action.source.type === "document") {
          // Document-level action (block selection mode)
          const result = yield* blockSel.handleDocumentAction(
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
            const result = yield* editor.handleClick(ctx);
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
            editor.interpretKeyDown(
              action as AppAction & { _tag: "KeyDown" },
              cursor,
              ctx,
            ),
          ),
          Match.when("SelectionChange", () =>
            editor.handleSelectionChange(
              action as AppAction & { _tag: "SelectionChange" },
              ctx,
            ),
          ),
          Match.when("Blur", () => editor.handleBlur(ctx)),
          Match.when("Click", () => editor.handleClick(ctx)),
          Match.exhaustive,
        );

        yield* logResult(action._tag, result);
        return result;
      }).pipe(
        // Catch all errors and return not-handled to let native behavior proceed
        Effect.catchAll(() => Effect.succeed(ActionResult.notHandled())),
      );

    // ========================================================================
    // Unified keyboard handler
    // ========================================================================

    const runKeyboardHandler = (
      callbacks: AppShortcutCallbacks,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const stream = yield* Keyboard.keydowns();

        yield* Stream.runForEach(stream, (event) =>
          Effect.gen(function* () {
            const mode = yield* Buffer.getMode();

            // --- App shortcuts (global, always active) ---
            if (event.modifiers.meta && event.key === "k") {
              event.preventDefault();
              callbacks.onOpenCommandPalette();
              return;
            }
            if (event.modifiers.meta && event.key === "\\") {
              event.preventDefault();
              callbacks.onToggleSidebar();
              return;
            }

            // --- Block selection mode ---
            if (mode.type === "blockSelection") {
              // When a popup is open, let the popup component handle all keys
              const bufferDoc = yield* Store.getDocument(
                "buffer",
                mode.bufferId,
              ).pipe(Effect.orDie);
              if (Option.isSome(bufferDoc) && bufferDoc.value.popup != null) {
                return;
              }

              const handled = yield* KeyEventBus.emit({
                key: event.key,
                modifiers: event.modifiers,
                source: { type: "app" },
              });
              if (handled) {
                event.preventDefault();
                return;
              }

              // Route Enter through CommandBus (Cmd+Enter is toggle-todo, handled by legacy path)
              if (event.key === "Enter" && !event.modifiers.meta) {
                yield* CommandBus.dispatch(new EditBlock());
                event.preventDefault();
                return;
              }

              // Route Tab/Shift+Tab through CommandBus
              if (event.key === "Tab") {
                const command = event.modifiers.shift
                  ? new Outdent()
                  : new Indent();
                yield* CommandBus.dispatch(command);
                event.preventDefault();
                return;
              }

              const result = yield* handle({
                _tag: "KeyDown",
                key: event.key,
                modifiers: event.modifiers,
                source: { type: "document", bufferId: mode.bufferId },
              });
              if (result.handled) {
                event.preventDefault();
                // Execute scroll intent if present
                if (result.intent.scroll) {
                  // Try block first, then title element
                  let blockEl = document.querySelector(
                    `[data-element-id="${result.intent.scroll}"]`,
                  ) as HTMLElement | null;
                  // If not found and it's a buffer/node ID, the target might be a title
                  if (!blockEl && result.intent.scroll.includes("/node:")) {
                    // Extract raw buffer ID from block ID format (buffer:xxx/node:yyy -> xxx)
                    const match = result.intent.scroll.match(/^buffer:([^/]+)/);
                    if (match) {
                      // Title uses raw ID as data-element-id (without buffer: prefix)
                      blockEl = document.querySelector(
                        `[data-element-type="title"][data-element-id="${match[1]}"]`,
                      ) as HTMLElement | null;
                    }
                  }
                  if (blockEl) {
                    const { scrollElementIntoView } = yield* Effect.promise(
                      () => import("@/utils/scroll"),
                    );
                    scrollElementIntoView(blockEl);
                  }
                }
              }
            }
          }),
        );
      });

    return { handle, runKeyboardHandler };
  }),
);
