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
  Tab,
  ShiftTab,
} from "@/commands/editor";
import { Id } from "@/schema";
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

export interface KeyEvent {
  key: string;
  modifiers: Modifiers;
  source: {
    type: "editor" | "document";
    blockId: Id.Block;
  };
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
  Tab: () => new Tab(),
};

const metaKeymap: Record<string, () => Command> = {
  ArrowLeft: () => new MoveToLineStart(),
  ArrowRight: () => new MoveToLineEnd(),
  Backspace: () => new DeleteToLineStart(),
  Delete: () => new DeleteToLineEnd(),
};

const shiftKeymap: Record<string, () => Command> = {
  Tab: () => new ShiftTab(),
};

const altKeymap: Record<string, () => Command> = {
  ArrowLeft: () => new MoveWordLeft(),
  ArrowRight: () => new MoveWordRight(),
  Backspace: () => new DeleteWordBackward(),
  Delete: () => new DeleteWordForward(),
};

/**
 * Look up command for a key event.
 * Returns Option.some(command) if matched, Option.none() if not.
 *
 * Context-dependent behavior (e.g., "at cursor start") is handled
 * INSIDE command handlers, not here. The keymap is just key → command.
 */
const lookupKeymap = (event: KeyEvent): Option.Option<Command> => {
  const { key, modifiers } = event;
  const { meta, ctrl, alt, shift } = modifiers;

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
              blockId: event.source.blockId,
            }),
          );

          const commandOpt = lookupKeymap(event);

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
