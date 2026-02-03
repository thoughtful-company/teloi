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
  Indent,
  OpenTypePicker,
  Outdent,
  ZoomIn,
  ZoomOut,
} from "@/commands/buffer";
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
import { BufferT } from "@/services/ui/Buffer";
import { CommandBusT, type Command } from "@/services/ui/CommandBus";
import { Context, Effect, Layer, Option } from "effect";

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
  | { type: "editor"; blockId: Id.Block }
  | { type: "document"; blockId: Id.Block }
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

/** Keymap for block selection mode (app-level events). */
const blockSelectionKeymap: Record<string, () => Command> = {
  "#": () => new OpenTypePicker(),
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
  mode: "blockSelection" | "editor",
): Option.Option<Command> => {
  const { key, modifiers } = event;
  const { meta, ctrl, alt, shift } = modifiers;

  // Block selection mode: only check blockSelectionKeymap, don't fall through
  // to editor keymaps (e.g., ArrowUp/Down mean different things in each mode)
  if (mode === "blockSelection") {
    const factory = blockSelectionKeymap[key];
    if (factory && !meta && !ctrl) return Option.some(factory());
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

export class KeyEventBusT extends Context.Tag("KeyEventBusT")<
  KeyEventBusT,
  {
    /**
     * Emit a keyboard event to the bus.
     * Returns true if a command was dispatched, false otherwise.
     */
    emit: (event: KeyEvent) => Effect.Effect<boolean>;
  }
>() {}

export const KeyEventBusLive = Layer.effect(
  KeyEventBusT,
  Effect.gen(function* () {
    const CommandBus = yield* CommandBusT;
    const Buffer = yield* BufferT;

    return {
      emit: (event: KeyEvent): Effect.Effect<boolean> =>
        Effect.gen(function* () {
          yield* Effect.logDebug("KeyEventBus received").pipe(
            Effect.annotateLogs({
              key: event.key,
              meta: event.modifiers.meta,
              ctrl: event.modifiers.ctrl,
              alt: event.modifiers.alt,
              shift: event.modifiers.shift,
              sourceType: event.source.type,
              ...(event.source.type !== "app"
                ? { blockId: event.source.blockId }
                : {}),
            }),
          );

          const keymapMode: "blockSelection" | "editor" =
            event.source.type === "app"
              ? yield* Buffer.getMode().pipe(
                  Effect.map((m) =>
                    m.type === "blockSelection" ? "blockSelection" : "editor",
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
        }),
    };
  }),
);
