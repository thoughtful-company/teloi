/**
 * EditorT — Editor state management service.
 *
 * Responsibilities:
 * - Hold reference to the currently active CodeMirror EditorView
 * - Sync editor state to model (selection)
 *
 * Data flows unidirectionally: CodeMirror → model.
 * This is NOT action interpretation—just state sync.
 */

import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import {
  cursorCharLeft,
  cursorCharRight,
  cursorGroupLeft,
  cursorGroupRight,
  cursorLineDown,
  cursorLineUp,
  deleteCharBackward,
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
} from "@codemirror/commands";
import { EditorSelection, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Context, Data, Effect, Layer, Option, Ref } from "effect";

export class NoActiveEditorError extends Data.TaggedError(
  "NoActiveEditorError",
) {}

export interface Selection {
  anchor: number;
  head: number;
  assoc: -1 | 0 | 1;
}

export class EditorT extends Context.Tag("EditorT")<
  EditorT,
  {
    /**
     * Create CodeMirror extension for state sync (selection changes).
     * Must be added to EditorView at creation time.
     *
     * TODO: Add beforeunload handler to sync selection on tab close.
     */
    createExtension: (
      blockId: Id.Block,
      runSync: <A>(effect: Effect.Effect<A>) => A,
    ) => Extension;

    registerView: (view: EditorView) => Effect.Effect<void>;
    clearView: () => Effect.Effect<void>;
    getView: () => Effect.Effect<EditorView, NoActiveEditorError>;

    isCursorAtStart: () => Effect.Effect<boolean, NoActiveEditorError>;
    moveLeft: () => Effect.Effect<void, NoActiveEditorError>;
    isCursorAtEnd: () => Effect.Effect<boolean, NoActiveEditorError>;
    moveRight: () => Effect.Effect<void, NoActiveEditorError>;

    isCursorOnFirstLine: () => Effect.Effect<boolean, NoActiveEditorError>;
    isCursorOnLastLine: () => Effect.Effect<boolean, NoActiveEditorError>;
    getGoalX: () => Effect.Effect<number, NoActiveEditorError>;
    moveUp: () => Effect.Effect<void, NoActiveEditorError>;
    moveDown: () => Effect.Effect<void, NoActiveEditorError>;

    moveLineBoundaryLeft: () => Effect.Effect<void, NoActiveEditorError>;
    moveLineBoundaryRight: () => Effect.Effect<void, NoActiveEditorError>;
    moveWordLeft: () => Effect.Effect<void, NoActiveEditorError>;
    moveWordRight: () => Effect.Effect<void, NoActiveEditorError>;

    deleteBackward: () => Effect.Effect<void, NoActiveEditorError>;
    deleteForward: () => Effect.Effect<void, NoActiveEditorError>;
    deleteToLineStart: () => Effect.Effect<void, NoActiveEditorError>;
    deleteToLineEnd: () => Effect.Effect<void, NoActiveEditorError>;
    deleteWordBackward: () => Effect.Effect<void, NoActiveEditorError>;
    deleteWordForward: () => Effect.Effect<void, NoActiveEditorError>;
    setCursor: (offset: number) => Effect.Effect<void, NoActiveEditorError>;
  }
>() {}

const assocToSide = (a: number): -1 | 1 => (a === 1 ? 1 : -1);

const isOnEdgeLine = (view: EditorView, forward: boolean): boolean => {
  const sel = view.state.selection.main;
  const currentY = view.coordsAtPos(sel.head, assocToSide(sel.assoc))?.top;
  const moved = view.moveVertically(sel, forward);
  const movedY = view.coordsAtPos(moved.head, assocToSide(moved.assoc))?.top;
  return currentY === movedY;
};

export const EditorLive = Layer.effect(
  EditorT,
  Effect.gen(function* () {
    const viewRef = yield* Ref.make<Option.Option<EditorView>>(Option.none());

    // Capture dependencies for use in extension callbacks
    const Frame = yield* FrameT;
    const context = Context.make(FrameT, Frame);

    // Helper to access view or fail with NoActiveEditorError
    const withView = <A>(
      fn: (view: EditorView) => A,
    ): Effect.Effect<A, NoActiveEditorError> =>
      Ref.get(viewRef).pipe(
        Effect.andThen(
          Option.match({
            onNone: () => Effect.fail(new NoActiveEditorError()),
            onSome: (view) => Effect.succeed(fn(view)),
          }),
        ),
      );

    // Internal effect factories for extension callbacks
    const makeSyncSelectionEffect = (
      blockId: Id.Block,
      selection: Selection,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const blockContext = Id.parseBlockContextSync(blockId);
        const frameId = blockContext.frameId;

        // Preserve goalX/goalLine if they exist in the current selection.
        // Allows goalX to survive across multiple arrow key presses through shorter blocks.
        const existingSelection = yield* Frame.getSelection(frameId);
        const existingGoalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : null;
        const existingGoalLine =
          existingGoalX != null && Option.isSome(existingSelection)
            ? existingSelection.value.goalLine
            : null;

        yield* Frame.setSelection(
          frameId,
          Option.some({
            blockId,
            selection: {
              anchor: selection.anchor,
              head: selection.head,
              assoc: selection.assoc,
            },
            goalX: existingGoalX,
            goalLine: existingGoalLine,
          }),
        );
      }).pipe(Effect.provide(context), Effect.orDie);

    return {
      createExtension: (
        blockId: Id.Block,
        runSync: <A>(effect: Effect.Effect<A>) => A,
      ): Extension =>
        EditorView.updateListener.of((update) => {
          // Guard against runtime being disposed (e.g., during test cleanup)
          try {
            if (update.selectionSet) {
              const sel = update.view.state.selection.main;
              runSync(
                makeSyncSelectionEffect(blockId, {
                  anchor: sel.anchor,
                  head: sel.head,
                  assoc: sel.assoc as -1 | 0 | 1,
                }),
              );
            }
          } catch {
            // Runtime disposed - ignore (happens during cleanup)
          }
        }),

      registerView: (view: EditorView): Effect.Effect<void> =>
        Ref.set(viewRef, Option.some(view)),

      clearView: (): Effect.Effect<void> => Ref.set(viewRef, Option.none()),

      getView: () => withView((view) => view),

      isCursorAtStart: () =>
        withView((view) => {
          const sel = view.state.selection.main;
          return sel.empty && sel.head === 0;
        }),

      moveLeft: () =>
        withView((view) => cursorCharLeft(view)).pipe(Effect.asVoid),

      isCursorAtEnd: () =>
        withView((view) => {
          const sel = view.state.selection.main;
          return sel.empty && sel.head === view.state.doc.length;
        }),

      moveRight: () =>
        withView((view) => cursorCharRight(view)).pipe(Effect.asVoid),

      isCursorOnFirstLine: () => withView((view) => isOnEdgeLine(view, false)),

      isCursorOnLastLine: () => withView((view) => isOnEdgeLine(view, true)),

      getGoalX: () =>
        withView((view) => {
          const sel = view.state.selection.main;
          return view.coordsAtPos(sel.head)?.left ?? 0;
        }),

      moveUp: () => withView((view) => cursorLineUp(view)).pipe(Effect.asVoid),

      moveDown: () =>
        withView((view) => cursorLineDown(view)).pipe(Effect.asVoid),

      moveLineBoundaryLeft: () =>
        withView((view) => {
          const sel = view.state.selection.main;
          let moved = view.moveToLineBoundary(sel, false);
          // Already at wrap point — step one char back, then find previous wrap point
          if (moved.head === sel.head && sel.head > 0) {
            const stepped = EditorSelection.cursor(sel.head - 1);
            moved = view.moveToLineBoundary(stepped, false);
          }
          if (moved.head !== sel.head) {
            view.dispatch({
              selection: EditorSelection.create([
                EditorSelection.cursor(moved.head, 1),
              ]),
            });
          }
        }).pipe(Effect.asVoid),

      moveLineBoundaryRight: () =>
        withView((view) => {
          const sel = view.state.selection.main;
          let moved = view.moveToLineBoundary(sel, true);
          // Already at wrap point — step one char forward, then find next wrap point
          if (moved.head === sel.head && sel.head < view.state.doc.length) {
            const stepped = EditorSelection.cursor(sel.head + 1);
            moved = view.moveToLineBoundary(stepped, true);
          }
          if (moved.head !== sel.head) {
            view.dispatch({
              selection: EditorSelection.create([
                EditorSelection.cursor(moved.head, -1),
              ]),
            });
          }
        }).pipe(Effect.asVoid),

      moveWordLeft: () =>
        withView((view) => cursorGroupLeft(view)).pipe(Effect.asVoid),

      moveWordRight: () =>
        withView((view) => cursorGroupRight(view)).pipe(Effect.asVoid),

      deleteBackward: () =>
        withView((view) => deleteCharBackward(view)).pipe(Effect.asVoid),

      deleteForward: () =>
        withView((view) => deleteCharForward(view)).pipe(Effect.asVoid),

      deleteToLineStart: () =>
        withView((view) => {
          const range = view.state.selection.main;
          if (range.head === 0) return;
          const lineStart = view.moveToLineBoundary(range, false).head;
          const from =
            range.head > lineStart
              ? lineStart
              : view.moveToLineBoundary(
                  EditorSelection.cursor(range.head - 1),
                  false,
                ).head;
          view.dispatch({ changes: { from, to: range.head } });
        }).pipe(Effect.asVoid),

      deleteToLineEnd: () =>
        withView((view) => {
          const range = view.state.selection.main;
          if (range.head === view.state.doc.length) return;
          const lineEnd = view.moveToLineBoundary(range, true).head;
          const to =
            range.head < lineEnd
              ? lineEnd
              : view.moveToLineBoundary(
                  EditorSelection.cursor(range.head + 1),
                  true,
                ).head;
          view.dispatch({ changes: { from: range.head, to } });
        }).pipe(Effect.asVoid),

      deleteWordBackward: () =>
        withView((view) => deleteGroupBackward(view)).pipe(Effect.asVoid),

      deleteWordForward: () =>
        withView((view) => deleteGroupForward(view)).pipe(Effect.asVoid),

      setCursor: (offset: number) =>
        withView((view) => {
          view.dispatch({
            selection: EditorSelection.create([EditorSelection.cursor(offset)]),
          });
        }).pipe(Effect.asVoid),
    };
  }),
);
