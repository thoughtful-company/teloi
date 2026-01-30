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
    const cursorOnFirstLineRef = yield* Ref.make(true);
    const cursorOnLastLineRef = yield* Ref.make(false);
    const goalXRef = yield* Ref.make(50);
    const moveUpCalledRef = yield* Ref.make(false);
    const moveDownCalledRef = yield* Ref.make(false);
    const moveHomeCalledRef = yield* Ref.make(false);
    const moveEndCalledRef = yield* Ref.make(false);

    const layer = Layer.succeed(EditorT, {
      isCursorAtStart: () => Ref.get(cursorAtStartRef),
      isCursorAtEnd: () => Ref.get(cursorAtEndRef),
      moveLeft: () => Ref.set(moveLeftCalledRef, true),
      moveRight: () => Ref.set(moveRightCalledRef, true),
      isCursorOnFirstLine: () => Ref.get(cursorOnFirstLineRef),
      isCursorOnLastLine: () => Ref.get(cursorOnLastLineRef),
      getGoalX: () => Ref.get(goalXRef),
      moveUp: () => Ref.set(moveUpCalledRef, true),
      moveDown: () => Ref.set(moveDownCalledRef, true),
      moveHome: () => Ref.set(moveHomeCalledRef, true),
      moveEnd: () => Ref.set(moveEndCalledRef, true),
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
      setCursorOnFirstLine: (value: boolean) =>
        Ref.set(cursorOnFirstLineRef, value),
      setCursorOnLastLine: (value: boolean) =>
        Ref.set(cursorOnLastLineRef, value),
      setGoalX: (value: number) => Ref.set(goalXRef, value),
      getMoveUpCalled: () => Ref.get(moveUpCalledRef),
      resetMoveUpCalled: () => Ref.set(moveUpCalledRef, false),
      getMoveDownCalled: () => Ref.get(moveDownCalledRef),
      resetMoveDownCalled: () => Ref.set(moveDownCalledRef, false),
      getMoveHomeCalled: () => Ref.get(moveHomeCalledRef),
      resetMoveHomeCalled: () => Ref.set(moveHomeCalledRef, false),
      getMoveEndCalled: () => Ref.get(moveEndCalledRef),
      resetMoveEndCalled: () => Ref.set(moveEndCalledRef, false),
    };
  });

export type EditorTestHandle = Effect.Effect.Success<
  ReturnType<typeof makeEditorTest>
>;
