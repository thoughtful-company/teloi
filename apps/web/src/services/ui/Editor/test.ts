/**
 * Test fake for EditorT service.
 * Provides controllable cursor state for unit testing commands.
 */

import { Effect, Layer, Ref } from "effect";
import { NoActiveEditorError, EditorT } from "./index";

/**
 * Creates a test-controllable EditorT service.
 *
 * Returns an Effect that yields:
 * - layer: The service layer to provide to the test runtime
 * - setCursorAtStart: Effect to control what `isCursorAtStart()` returns
 * - setMoveLeftCalled: Ref to check if `moveLeft()` was called
 */
export const makeEditorTest = () =>
  Effect.gen(function* () {
    const cursorAtStartRef = yield* Ref.make(true);
    const moveLeftCalledRef = yield* Ref.make(false);

    const layer = Layer.succeed(EditorT, {
      isCursorAtStart: () => Ref.get(cursorAtStartRef),
      moveLeft: () =>
        Effect.gen(function* () {
          yield* Ref.set(moveLeftCalledRef, true);
        }),
      createExtension: () => [],
      registerView: () => Effect.void,
      clearView: () => Effect.void,
      getView: () => Effect.fail(new NoActiveEditorError()),
    });

    return {
      layer,
      setCursorAtStart: (value: boolean) => Ref.set(cursorAtStartRef, value),
      getMoveLeftCalled: () => Ref.get(moveLeftCalledRef),
      resetMoveLeftCalled: () => Ref.set(moveLeftCalledRef, false),
    };
  });

export type EditorTestHandle = Effect.Effect.Success<
  ReturnType<typeof makeEditorTest>
>;
