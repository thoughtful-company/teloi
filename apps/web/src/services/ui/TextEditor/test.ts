/**
 * Test fake for TextEditorT service.
 * Provides controllable cursor state for unit testing commands.
 */

import { Effect, Layer, Ref } from "effect";
import { NoActiveTextEditorError, TextEditorT } from "./index";

/**
 * Creates a test-controllable TextEditorT service.
 *
 * Returns an Effect that yields:
 * - layer: The service layer to provide to the test runtime
 * - setCursorAtStart: Effect to control what `isCursorAtStart()` returns
 * - setMoveLeftCalled: Ref to check if `moveLeft()` was called
 */
export const makeTextEditorTest = () =>
  Effect.gen(function* () {
    const cursorAtStartRef = yield* Ref.make(true);
    const moveLeftCalledRef = yield* Ref.make(false);

    const layer = Layer.succeed(TextEditorT, {
      isCursorAtStart: () => Ref.get(cursorAtStartRef),
      moveLeft: () =>
        Effect.gen(function* () {
          yield* Ref.set(moveLeftCalledRef, true);
        }),
      createExtension: () => [],
      registerView: () => Effect.void,
      clearView: () => Effect.void,
      getView: () => Effect.fail(new NoActiveTextEditorError()),
    });

    return {
      layer,
      setCursorAtStart: (value: boolean) => Ref.set(cursorAtStartRef, value),
      getMoveLeftCalled: () => Ref.get(moveLeftCalledRef),
      resetMoveLeftCalled: () => Ref.set(moveLeftCalledRef, false),
    };
  });

export type TextEditorTestHandle = Effect.Effect.Success<
  ReturnType<typeof makeTextEditorTest>
>;
