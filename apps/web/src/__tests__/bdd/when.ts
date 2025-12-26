import { Id } from "@/schema";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";

/**
 * Waits for a block element to appear and clicks its text area.
 * Uses > div:first-child to target the text area, not the children container.
 */
export const USER_CLICKS_BLOCK = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const selector = `[data-element-id="${blockId}"] > div:first-child`;
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
 * Moves cursor to a specific offset from the start of the text.
 * Uses Home to go to start, then ArrowRight to reach position.
 */
export const USER_MOVES_CURSOR_TO = (offset: number) =>
  Effect.gen(function* () {
    yield* Effect.promise(() => userEvent.keyboard("{Home}"));
    for (let i = 0; i < offset; i++) {
      yield* Effect.promise(() => userEvent.keyboard("{ArrowRight}"));
    }
  }).pipe(Effect.withSpan("When.USER_MOVES_CURSOR_TO"));
