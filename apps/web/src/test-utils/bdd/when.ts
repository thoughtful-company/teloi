import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { userEvent } from "@vitest/browser/context";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";

/**
 * Waits for a block element to appear and clicks its text area.
 * Uses .flex to target the text content div (works whether chevron is present or not).
 */
export const USER_CLICKS_BLOCK = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const selector = `[data-element-id="${blockId}"] > .flex`;
    const element = yield* Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`Block ${blockId} text area not found`);
          return el as HTMLElement;
        },
        { timeout: 2000 },
      ),
    );
    yield* Effect.promise(() => userEvent.click(element));
  }).pipe(Effect.withSpan("When.USER_CLICKS_BLOCK"));

/**
 * Waits for a title element to appear and clicks it.
 */
export const USER_CLICKS_TITLE = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const selector = `[data-element-type="title"][data-element-id="${bufferId}"]`;
    const element = yield* Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`Title for buffer ${bufferId} not found`);
          return el as HTMLElement;
        },
        { timeout: 2000 },
      ),
    );
    yield* Effect.promise(() => userEvent.click(element));
  }).pipe(Effect.withSpan("When.USER_CLICKS_TITLE"));

/**
 * Sends keyboard input to the currently focused element.
 */
export const USER_PRESSES = (keys: string) =>
  Effect.promise(() => userEvent.keyboard(keys)).pipe(
    Effect.withSpan("When.USER_PRESSES"),
  );

/**
 * Focuses a block via model state, then presses Escape
 * to enter block selection mode with that block selected.
 */
export const USER_ENTERS_BLOCK_SELECTION = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    const Window = yield* WindowT;

    const [bufferId] = yield* Id.parseBlockId(blockId);

    // Set selection first, then activate — so CodeMirror mounts with cursor in place
    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { elementId: blockId },
        anchorOffset: 0,
        focus: { elementId: blockId },
        focusOffset: 0,
        goalX: null,
        goalLine: null,
        assoc: 0,
      }),
    );

    yield* Effect.async<void>((resume) => {
      const timeout = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resume(
            Window.setActiveElement(
              Option.some({ type: "block", id: blockId }),
            ),
          );
        }),
      );
      return Effect.sync(() => clearTimeout(timeout));
    });

    // Wait for CodeMirror to be mounted and focused
    yield* Effect.promise(() =>
      waitFor(
        () => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        },
        { timeout: 2000 },
      ),
    );

    yield* USER_PRESSES("{Escape}");
  }).pipe(Effect.withSpan("When.USER_ENTERS_BLOCK_SELECTION"));

/**
 * Focuses the Buffer container for a buffer.
 * Use this after programmatically setting up block selection mode
 * so that keyboard events can be received.
 */
export const FOCUS_BUFFER_CONTAINER = (bufferId: Id.Buffer) =>
  Effect.sync(() => {
    const container = document.querySelector(
      `[data-buffer-id="${bufferId}"]`,
    ) as HTMLElement | null;
    if (!container) throw new Error(`Buffer container ${bufferId} not found`);
    container.focus();
  }).pipe(Effect.withSpan("When.FOCUS_BUFFER_CONTAINER"));
