/**
 * KeyEventBus - Central keyboard event routing service.
 *
 * Receives raw keyboard events from Editor (and potentially other sources).
 * Maps key events to commands via hardcoded keymap, dispatches to CommandBus.
 *
 * Returns whether a command was dispatched, so callers can decide
 * whether to preventDefault on the original DOM event.
 */

import {
  Collapse,
  EditBlock,
  Expand,
  Indent,
  OpenTypePicker,
  Outdent,
  Space,
  ZoomIn,
  ZoomOut,
} from "@/commands/frame";
import { Send as ChatSend } from "@/commands/chat";
import {
  Backspace,
  Delete,
  DeleteToLineStart,
  DeleteToLineEnd,
  DeleteWordBackward,
  DeleteWordForward,
  Enter,
  Left,
  Right,
  Up,
  Down,
  MoveToLineStart,
  MoveToLineEnd,
  MoveWordLeft,
  MoveWordRight,
  SelectBlock,
} from "@/commands/editor";
import { Id } from "@/schema";
import { KeyboardT } from "@/services/browser/Keyboard";
import { FrameT } from "@/services/ui/Frame";
import { CommandBusT, type Command } from "@/services/ui/CommandBus";
import { Context, Effect, Layer, Option, Stream } from "effect";

// ============================================================================
// Event Types
// ============================================================================

export interface Modifiers {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export type KeyEventSource =
  | { type: "editor"; khoraId: Id.Khora }
  | { type: "app" };

export interface KeyEvent {
  key: string;
  modifiers: Modifiers;
  source: KeyEventSource;
}

// ============================================================================
// Keymap
// ============================================================================

const plainKeymap: Record<string, () => Command> = {
  Backspace: () => new Backspace(),
  Delete: () => new Delete(),
  Enter: () => new Enter(),
  ArrowLeft: () => new Left(),
  ArrowRight: () => new Right(),
  ArrowUp: () => new Up(),
  ArrowDown: () => new Down(),
  Tab: () => new Indent(),
  Escape: () => new SelectBlock(),
};

const metaKeymap: Record<string, () => Command> = {
  ArrowUp: () => new Collapse(),
  ArrowDown: () => new Expand(),
  ArrowLeft: () => new MoveToLineStart(),
  ArrowRight: () => new MoveToLineEnd(),
  Backspace: () => new DeleteToLineStart(),
  Delete: () => new DeleteToLineEnd(),
  ".": () => new ZoomIn(),
  ",": () => new ZoomOut(),
  Enter: () => new ChatSend(),
};

const shiftKeymap: Record<string, () => Command> = {
  Tab: () => new Outdent(),
};

const altKeymap: Record<string, () => Command> = {
  ArrowLeft: () => new MoveWordLeft(),
  ArrowRight: () => new MoveWordRight(),
  Backspace: () => new DeleteWordBackward(),
  Delete: () => new DeleteWordForward(),
};

/** Keymap for khora selection mode (app-level events). */
const khoraSelectionKeymap: Record<string, () => Command> = {
  "#": () => new OpenTypePicker(),
  Enter: () => new EditBlock(),
  " ": () => new Space(),
  Tab: () => new Indent(),
};

/** Shift+ keymap for khora selection mode. */
const khoraSelectionShiftKeymap: Record<string, () => Command> = {
  Tab: () => new Outdent(),
};

/** Cmd+ keymap for khora selection mode. */
const khoraSelectionMetaKeymap: Record<string, () => Command> = {
  ArrowUp: () => new Collapse(),
  ArrowDown: () => new Expand(),
};

/**
 * Look up command for a key event.
 * Returns Option.some(command) if matched, Option.none() if not.
 *
 * Context-dependent behavior (e.g., "at cursor start") is handled
 * INSIDE command handlers, not here. The keymap is just key → command.
 */
const lookupKeymap = (
  event: KeyEvent,
  mode: "khoraSelection" | "editor",
): Option.Option<Command> => {
  const { key, modifiers } = event;
  const { meta, ctrl, alt, shift } = modifiers;

  // Khora selection mode: check khora selection keymaps only
  if (mode === "khoraSelection") {
    if (meta && !ctrl && !alt && !shift) {
      const factory = khoraSelectionMetaKeymap[key];
      if (factory) return Option.some(factory());
    }
    if (shift && !meta && !ctrl && !alt) {
      const factory = khoraSelectionShiftKeymap[key];
      if (factory) return Option.some(factory());
    }
    if (!meta && !ctrl && !alt && !shift) {
      const factory = khoraSelectionKeymap[key];
      if (factory) return Option.some(factory());
    }
    return Option.none();
  }

  if (!meta && !ctrl && !alt && !shift) {
    const factory = plainKeymap[key];
    if (factory) return Option.some(factory());
  }

  if (meta && !ctrl && !alt && !shift) {
    const factory = metaKeymap[key];
    if (factory) return Option.some(factory());
  }

  if (shift && !meta && !ctrl && !alt) {
    const factory = shiftKeymap[key];
    if (factory) return Option.some(factory());
  }

  if (alt && !meta && !ctrl && !shift) {
    const factory = altKeymap[key];
    if (factory) return Option.some(factory());
  }

  return Option.none();
};

// ============================================================================
// Service Definition
// ============================================================================

/**
 * Callbacks for app-level shortcuts.
 * These are UI actions that KeyEventBus shouldn't own directly.
 */
export interface AppShortcutCallbacks {
  onToggleSidebar: () => void;
  onOpenCommandPalette: () => void;
}

export class KeyEventBusT extends Context.Tag("KeyEventBusT")<
  KeyEventBusT,
  {
    /**
     * Emit a keyboard event to the bus.
     * Returns true if a command was dispatched, false otherwise.
     */
    emit: (event: KeyEvent) => Effect.Effect<boolean>;

    /**
     * Start the app-level keyboard handler.
     * Consumes window keyboard events and routes them:
     * - App shortcuts (Cmd+K, Cmd+\) → callbacks
     * - Khora selection mode → keymap lookup → command dispatch
     *
     * Returns a long-running Effect - run with runFork.
     */
    runAppKeyboardHandler: (
      callbacks: AppShortcutCallbacks,
    ) => Effect.Effect<void>;
  }
>() {}

export const KeyEventBusLive = Layer.effect(
  KeyEventBusT,
  Effect.gen(function* () {
    const CommandBus = yield* CommandBusT;
    const Frame = yield* FrameT;
    const Keyboard = yield* KeyboardT;

    const emit = Effect.fn("KeyEventBus.emit")(function* (event: KeyEvent) {
      yield* Effect.logDebug("KeyEventBus received").pipe(
        Effect.annotateLogs({
          key: event.key,
          meta: event.modifiers.meta,
          ctrl: event.modifiers.ctrl,
          alt: event.modifiers.alt,
          shift: event.modifiers.shift,
          sourceType: event.source.type,
          ...(event.source.type !== "app"
            ? { khoraId: event.source.khoraId }
            : {}),
        }),
      );

      const keymapMode: "khoraSelection" | "editor" =
        event.source.type === "app"
          ? yield* Frame.getMode().pipe(
              Effect.map((m) =>
                m.type === "khoraSelection" ? "khoraSelection" : "editor",
              ),
            )
          : "editor";

      const commandOpt = lookupKeymap(event, keymapMode);

      if (Option.isSome(commandOpt)) {
        yield* CommandBus.dispatch(commandOpt.value);
        return true;
      }

      yield* Effect.logDebug("KeyEventBus: no command for key").pipe(
        Effect.annotateLogs({ key: event.key }),
      );
      return false;
    });

    const runAppKeyboardHandler = Effect.fn(
      "KeyEventBus.runAppKeyboardHandler",
    )(function* (callbacks: AppShortcutCallbacks) {
      const stream = yield* Keyboard.keydowns();

      yield* Stream.runForEach(stream, (event) =>
        Effect.gen(function* () {
          const mode = yield* Frame.getMode();

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

          // --- Khora selection mode ---
          if (mode.type === "khoraSelection") {
            // When a popup is open, let the popup component handle all keys
            const popupOpen = yield* Frame.hasPopup(mode.frameId).pipe(
              Effect.orDie,
            );
            if (popupOpen) return;

            const handled = yield* emit({
              key: event.key,
              modifiers: event.modifiers,
              source: { type: "app" },
            });
            if (handled) {
              event.preventDefault();
            }
          }
        }),
      );
    });

    return { emit, runAppKeyboardHandler };
  }),
);
