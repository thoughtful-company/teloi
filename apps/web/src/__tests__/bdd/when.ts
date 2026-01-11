import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
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
 * TODO: Fix, it's not working
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

/**
 * Sets selection to a specific position in a node via the model.
 * This is more reliable than keyboard navigation for positioning.
 * @param assoc - Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line
 */
export const SELECTION_IS_SET_TO = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  offset: number,
  assoc: -1 | 0 | 1 = 0,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { nodeId },
        anchorOffset: offset,
        focus: { nodeId },
        focusOffset: offset,
        goalX: null,
        goalLine: null,
        assoc,
      }),
    );
  }).pipe(Effect.withSpan("When.SELECTION_IS_SET_TO"));

/**
 * Clicks a block, waits for CodeMirror to be focused, then presses Escape
 * to enter block selection mode with that block selected.
 */
export const USER_ENTERS_BLOCK_SELECTION = (blockId: Id.Block) =>
  Effect.gen(function* () {
    yield* USER_CLICKS_BLOCK(blockId);

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
