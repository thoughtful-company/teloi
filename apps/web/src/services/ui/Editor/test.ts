/**
 * Test fake for EditorT service.
 * Provides controllable cursor state for unit testing commands.
 */

import { Effect, Layer, Ref } from "effect";
import { NoActiveEditorError, EditorT } from "./index";

export const makeEditorTest = () =>
  Effect.gen(function* () {
    const cursorAtStartRef = yield* Ref.make(true);
    const cursorAtEndRef = yield* Ref.make(false);
    const moveLeftCalledRef = yield* Ref.make(false);
    const moveRightCalledRef = yield* Ref.make(false);

    const layer = Layer.succeed(EditorT, {
      isCursorAtStart: () => Ref.get(cursorAtStartRef),
      isCursorAtEnd: () => Ref.get(cursorAtEndRef),
      moveLeft: () => Ref.set(moveLeftCalledRef, true),
      moveRight: () => Ref.set(moveRightCalledRef, true),
      createExtension: () => [],
      registerView: () => Effect.void,
      clearView: () => Effect.void,
      getView: () => Effect.fail(new NoActiveEditorError()),
    });

    return {
      layer,
      setCursorAtStart: (value: boolean) => Ref.set(cursorAtStartRef, value),
      setCursorAtEnd: (value: boolean) => Ref.set(cursorAtEndRef, value),
      getMoveLeftCalled: () => Ref.get(moveLeftCalledRef),
      resetMoveLeftCalled: () => Ref.set(moveLeftCalledRef, false),
      getMoveRightCalled: () => Ref.get(moveRightCalledRef),
      resetMoveRightCalled: () => Ref.set(moveRightCalledRef, false),
    };
  });

export type EditorTestHandle = Effect.Effect.Success<
  ReturnType<typeof makeEditorTest>
>;
