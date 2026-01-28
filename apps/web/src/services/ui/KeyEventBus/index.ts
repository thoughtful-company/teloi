/**
 * KeyEventBus - Central keyboard event routing service.
 *
 * Receives raw keyboard events from TextEditor (and potentially other sources).
 * Will eventually: compute context from TextEditorT, match against keymap, execute handlers.
 *
 * For now: just accepts events and does nothing. Plumbing first.
 */

import { Id } from "@/schema";
import { Context, Effect, Layer, Logger, LogLevel } from "effect";

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

export class KeyEventBusT extends Context.Tag("KeyEventBusT")<
  KeyEventBusT,
  {
    /**
     * Emit a keyboard event to the bus.
     * Returns whether the event was handled (for preventDefault decisions).
     */
    emit: (event: KeyEvent) => Effect.Effect<boolean>;
  }
>() {}

export const KeyEventBusLive = Layer.effect(
  KeyEventBusT,
  Effect.gen(function* () {
    return {
      emit: (event: KeyEvent): Effect.Effect<boolean> =>
        Effect.gen(function* () {
          yield* Effect.log("KeyEventBus received").pipe(
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
          // TODO: compute context, match keymap, execute handler
          return false;
        }).pipe(Logger.withMinimumLogLevel(LogLevel.Debug)),
    };
  }),
);
