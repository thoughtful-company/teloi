/**
 * KeyEventBus - Central keyboard event routing service.
 *
 * Receives raw keyboard events from Editor (and potentially other sources).
 * Maps key events to commands via hardcoded keymap, dispatches to CommandBus.
 *
 * The preventDefault decision is made BEFORE events reach this bus (in isRoutableKey).
 * This bus just figures out what command to run and executes it.
 */

import { Left, Right, Up, Down, Home, End } from "@/commands/editor";
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
  ArrowLeft: () => new Left(),
  ArrowRight: () => new Right(),
  ArrowUp: () => new Up(),
  ArrowDown: () => new Down(),
  Home: () => new Home(),
  End: () => new End(),
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
     * Looks up keymap and dispatches command if matched.
     */
    emit: (event: KeyEvent) => Effect.Effect<void>;
  }
>() {}

export const KeyEventBusLive = Layer.effect(
  KeyEventBusT,
  Effect.gen(function* () {
    const CommandBus = yield* CommandBusT;

    return {
      emit: (event: KeyEvent): Effect.Effect<void> =>
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
          } else {
            yield* Effect.logDebug("KeyEventBus: no command for key").pipe(
              Effect.annotateLogs({ key: event.key }),
            );
          }
        }),
    };
  }),
);
