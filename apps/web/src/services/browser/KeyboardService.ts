import { Context, Data, Effect, Layer, Stream } from "effect";

/**
 * App-level keyboard shortcuts. Add new variants as needed.
 */
export type AppShortcut = Data.TaggedEnum<{
  ToggleSidebar: {};
  OpenCommandPalette: {};
}>;

export const AppShortcut = Data.taggedEnum<AppShortcut>();

interface KeyBinding {
  key: string;
  mod: boolean;
  shift?: boolean;
  alt?: boolean;
}

const BINDINGS: ReadonlyArray<{ binding: KeyBinding; shortcut: AppShortcut }> = [
  { binding: { key: "\\", mod: true }, shortcut: AppShortcut.ToggleSidebar() },
  { binding: { key: "k", mod: true }, shortcut: AppShortcut.OpenCommandPalette() },
];

export class KeyboardB extends Context.Tag("KeyboardB")<
  KeyboardB,
  {
    /**
     * Stream that emits when app-level shortcuts are triggered.
     * Handles Mod key abstraction (Cmd on Mac, Ctrl elsewhere).
     */
    shortcuts: () => Effect.Effect<Stream.Stream<AppShortcut>>;
  }
>() {}

export const makeKeyboardLive = (window: Window) => {
  if (!window) {
    throw new Error("Cannot construct KeyboardB without the window object");
  }

  return Layer.effect(
    KeyboardB,
    Effect.sync(() => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");

      const shortcuts = () =>
        Effect.sync(() =>
          Stream.async<AppShortcut>((emit) => {
            const handler = (e: KeyboardEvent) => {
              const modPressed = isMac ? e.metaKey : e.ctrlKey;

              for (const { binding, shortcut } of BINDINGS) {
                const modMatch = binding.mod === modPressed;
                const shiftMatch = (binding.shift ?? false) === e.shiftKey;
                const altMatch = (binding.alt ?? false) === e.altKey;
                const keyMatch = e.key === binding.key;

                if (modMatch && shiftMatch && altMatch && keyMatch) {
                  e.preventDefault();
                  emit.single(shortcut);
                  return;
                }
              }
            };

            window.addEventListener("keydown", handler);
            return Effect.sync(() =>
              window.removeEventListener("keydown", handler),
            );
          }),
        );

      return { shortcuts };
    }),
  );
};
