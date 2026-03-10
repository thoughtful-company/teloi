import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { userEvent } from "@vitest/browser/context";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";

/**
 * Waits for a block element to appear and clicks its text area.
 * Uses .flex to target the text content div (works whether chevron is present or not).
 */
export const USER_CLICKS_KHORA = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const selector = `[data-element-id="${khoraId}"] > .flex`;
    const element = yield* Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`Block ${khoraId} text area not found`);
          return el as HTMLElement;
        },
        { timeout: 2000 },
      ),
    );
    yield* Effect.promise(() => userEvent.click(element));
  }).pipe(Effect.withSpan("When.USER_CLICKS_KHORA"));

/**
 * Waits for a title element to appear and clicks it.
 */
export const USER_CLICKS_TITLE = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const selector = `[data-element-type="title"][data-element-id="${frameId}"]`;
    const element = yield* Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`Title for frame ${frameId} not found`);
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
 * to enter khora selection mode with that block selected.
 */
export const USER_ENTERS_KHORA_SELECTION = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    const [frameId] = yield* Id.parseKhoraId(khoraId);

    // Set selection first, then activate — so CodeMirror mounts with cursor in place
    yield* Frame.setSelection(
      frameId,
      Option.some({
        khoraId,
        selection: {
          anchor: 0,
          head: 0,
          assoc: 0,
        },
        goalX: null,
        goalLine: null,
      }),
    );

    yield* Effect.async<void>((resume) => {
      const timeout = requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resume(Frame.enterBlockEditing(khoraId));
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
  }).pipe(Effect.withSpan("When.USER_ENTERS_KHORA_SELECTION"));

/**
 * Focuses the Frame container for a frame.
 * Use this after programmatically setting up khora selection mode
 * so that keyboard events can be received.
 */
export const FOCUS_FRAME_CONTAINER = (frameId: Id.Frame) =>
  Effect.sync(() => {
    const container = document.querySelector(
      `[data-frame-id="${frameId}"]`,
    ) as HTMLElement | null;
    if (!container) throw new Error(`Frame container ${frameId} not found`);
    container.focus();
  }).pipe(Effect.withSpan("When.FOCUS_FRAME_CONTAINER"));
