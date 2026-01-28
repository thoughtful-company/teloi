/**
 * TextEditorT - Editor state management service.
 *
 * Responsibilities:
 * - Hold reference to the currently active CodeMirror EditorView
 * - Sync editor state to model (selection, blur cleanup)
 *
 * Data flows unidirectionally: CodeMirror → model.
 * This is NOT action interpretation—just state sync.
 */

import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Context, Data, Effect, Layer, Option, Ref } from "effect";

export class NoActiveTextEditorError extends Data.TaggedError(
  "NoActiveTextEditorError",
) {}

export interface Selection {
  anchor: number;
  head: number;
  assoc: -1 | 0 | 1;
}

export class TextEditorT extends Context.Tag("TextEditorT")<
  TextEditorT,
  {
    /**
     * Create CodeMirror extension for state sync (selection changes, blur).
     * Must be added to EditorView at creation time.
     *
     * TODO: Add beforeunload handler to sync selection on tab close.
     */
    createExtension: (
      blockId: Id.Block,
      runSync: <A>(effect: Effect.Effect<A>) => A,
    ) => Extension;

    /**
     * Register the EditorView after creation.
     */
    registerView: (view: EditorView) => Effect.Effect<void>;

    /**
     * Clear the EditorView when TextEditor unmounts.
     */
    clearView: () => Effect.Effect<void>;

    /**
     * Get the current EditorView.
     * Fails with NoActiveTextEditorError if no view is registered.
     */
    getView: () => Effect.Effect<EditorView, NoActiveTextEditorError>;
  }
>() {}

export const TextEditorLive = Layer.effect(
  TextEditorT,
  Effect.gen(function* () {
    const viewRef = yield* Ref.make<Option.Option<EditorView>>(Option.none());

    // Capture dependencies for use in extension callbacks
    const Buffer = yield* BufferT;
    const Window = yield* WindowT;
    const context = Context.make(BufferT, Buffer).pipe(
      Context.add(WindowT, Window),
    );

    // Internal effect factories for extension callbacks
    const makeSyncSelectionEffect = (
      blockId: Id.Block,
      selection: Selection,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const blockContext = Id.parseBlockContextSync(blockId);
        const bufferId = blockContext.bufferId;

        // Preserve goalX/goalLine if they exist in the current selection.
        // Allows goalX to survive across multiple arrow key presses through shorter blocks.
        const existingSelection = yield* Buffer.getSelection(bufferId);
        const existingGoalX =
          Option.isSome(existingSelection) &&
          existingSelection.value.goalX != null
            ? existingSelection.value.goalX
            : null;
        const existingGoalLine =
          existingGoalX != null && Option.isSome(existingSelection)
            ? existingSelection.value.goalLine
            : null;

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { elementId: blockId },
            anchorOffset: selection.anchor,
            focus: { elementId: blockId },
            focusOffset: selection.head,
            goalX: existingGoalX,
            goalLine: existingGoalLine,
            assoc: selection.assoc,
          }),
        );
      }).pipe(Effect.provide(context), Effect.orDie);

    const makeHandleBlurEffect = (blockId: Id.Block): Effect.Effect<void> =>
      Effect.gen(function* () {
        const blockContext = Id.parseBlockContextSync(blockId);
        const bufferId = blockContext.bufferId;

        // Only clear selection and activeElement if still pointing to this block
        const selectionOpt = yield* Buffer.getSelection(bufferId);
        const sel = Option.getOrNull(selectionOpt);
        const selBlockId = sel ? sel.anchor.elementId : null;

        if (sel && selBlockId === blockId) {
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Window.setActiveElement(Option.none());
        }
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
            if (update.focusChanged && !update.view.hasFocus) {
              runSync(makeHandleBlurEffect(blockId));
            }
          } catch {
            // Runtime disposed - ignore (happens during cleanup)
          }
        }),

      registerView: (view: EditorView): Effect.Effect<void> =>
        Ref.set(viewRef, Option.some(view)),

      clearView: (): Effect.Effect<void> => Ref.set(viewRef, Option.none()),

      getView: (): Effect.Effect<EditorView, NoActiveTextEditorError> =>
        Effect.gen(function* () {
          const maybeView = yield* Ref.get(viewRef);
          return yield* Option.match(maybeView, {
            onNone: () => Effect.fail(new NoActiveTextEditorError()),
            onSome: (view) => Effect.succeed(view),
          });
        }),
    };
  }),
);
