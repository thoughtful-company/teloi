import { Context, Effect, Layer, Stream } from "effect";

export type KeyDownEvent = {
  key: string;
  modifiers: { meta: boolean; ctrl: boolean; alt: boolean; shift: boolean };
  preventDefault: () => void;
};

export class KeyboardT extends Context.Tag("KeyboardT")<
  KeyboardT,
  {
    /**
     * Stream of raw keyboard events from the window.
     * Single source of truth for all keyboard handling.
     */
    keydowns: () => Effect.Effect<Stream.Stream<KeyDownEvent>>;
  }
>() {}

export const makeKeyboardLive = (window: Window) => {
  if (!window) {
    throw new Error("Cannot construct KeyboardT without the window object");
  }

  const isMac = navigator.platform.toUpperCase().includes("MAC");

  return Layer.effect(
    KeyboardT,
    Effect.sync(() => ({
      keydowns: () =>
        Effect.sync(() =>
          Stream.async<KeyDownEvent>((emit) => {
            const handler = (e: KeyboardEvent) => {
              emit.single({
                key: e.key,
                modifiers: {
                  // Normalize Cmd (Mac) / Ctrl (Win/Linux) to 'meta'
                  meta: isMac ? e.metaKey : e.ctrlKey,
                  ctrl: e.ctrlKey,
                  alt: e.altKey,
                  shift: e.shiftKey,
                },
                preventDefault: () => e.preventDefault(),
              });
            };
            window.addEventListener("keydown", handler);
            return Effect.sync(() =>
              window.removeEventListener("keydown", handler),
            );
          }),
        ),
    })),
  );
};
