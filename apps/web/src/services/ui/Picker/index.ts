/**
 * PickerT - Global picker state management service.
 *
 * Manages the state for type picker UI (open/close, query updates)
 * and coordinates high-level actions (selectType, createAndSelectType).
 */

import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import {
  Context,
  Effect,
  Layer,
  Option,
  Stream,
  SubscriptionRef,
} from "effect";
import { BufferT } from "../Buffer";
import { TypePickerT } from "../TypePicker";

export interface PickerState {
  elementId: Id.Block;
  position: { x: number; y: number };
  from: number;
  query: string;
}

export class PickerT extends Context.Tag("PickerT")<
  PickerT,
  {
    /**
     * Open the picker at the given position.
     * Sets state with elementId, position, from, and empty query.
     */
    open: (
      elementId: Id.Block,
      position: { x: number; y: number },
      from: number,
    ) => Effect.Effect<void>;

    /**
     * Close the picker.
     * Sets state to null.
     */
    close: () => Effect.Effect<void>;

    /**
     * Update the search query.
     * No-op when picker is closed (race condition protection).
     */
    updateQuery: (query: string) => Effect.Effect<void>;

    /**
     * Get the current picker state.
     * Returns null when picker is closed.
     */
    getState: () => Effect.Effect<PickerState | null>;

    /**
     * Subscribe to picker state changes.
     * Emits on open, close, and query updates.
     */
    subscribe: () => Effect.Effect<Stream.Stream<PickerState | null>>;

    /**
     * Select an existing type and apply it to the current node.
     * - Applies type via TypePickerT
     * - Deletes trigger text from Y.Text
     * - Sets selection back to original position
     * - Closes picker
     */
    selectType: (typeId: Id.Node) => Effect.Effect<void>;

    /**
     * Create a new type and apply it to the current node.
     * - Creates type via TypePickerT
     * - Applies type via TypePickerT
     * - Deletes trigger text from Y.Text
     * - Sets selection back to original position
     * - Closes picker
     */
    createAndSelectType: (name: string) => Effect.Effect<void>;
  }
>() {}

/**
 * Cleanup logic after type picker action:
 * 1. Delete the "#query" trigger text
 * 2. Set selection back to where "#" was
 * 3. Close the picker
 */
const finishPickerAction = (
  state: PickerState,
  ref: SubscriptionRef.SubscriptionRef<PickerState | null>,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;

    // Parse blockId to get bufferId and nodeId
    const blockContext = Id.parseBlockContextSync(state.elementId);
    const bufferId = blockContext.bufferId;
    const nodeId =
      blockContext.type === "buffer"
        ? blockContext.nodeId
        : blockContext.hostNodeId;

    // Delete trigger text: from position to from + query.length + 1 (for the "#" trigger char)
    const currentText = yield* Automerge.getText(nodeId);
    const deleteLength = state.query.length + 1; // +1 for the trigger character
    if (deleteLength > 0) {
      // Remove the trigger text by taking the text before and after the trigger
      const newText =
        currentText.slice(0, state.from) +
        currentText.slice(state.from + deleteLength);
      yield* Automerge.setText(nodeId, newText);
    }

    // Set selection back to where the trigger was
    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { elementId: state.elementId },
        anchorOffset: state.from,
        focus: { elementId: state.elementId },
        focusOffset: state.from,
        goalX: null,
        goalLine: null,
        assoc: 0,
      }),
    );

    // Close picker
    yield* SubscriptionRef.set(ref, null);
  });

export const PickerLive = Layer.effect(
  PickerT,
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make<PickerState | null>(null);

    // Capture dependencies for withContext pattern
    const TypePicker = yield* TypePickerT;
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;

    const context = Context.make(TypePickerT, TypePicker).pipe(
      Context.add(BufferT, Buffer),
      Context.add(AutomergeT, Automerge),
    );

    return {
      open: (
        elementId: Id.Block,
        position: { x: number; y: number },
        from: number,
      ): Effect.Effect<void> =>
        SubscriptionRef.set(ref, {
          elementId,
          position,
          from,
          query: "",
        }),

      close: (): Effect.Effect<void> => SubscriptionRef.set(ref, null),

      updateQuery: (query: string): Effect.Effect<void> =>
        SubscriptionRef.modify(ref, (current) => {
          if (current === null) {
            // No-op when picker is closed (race condition protection)
            return [undefined, null];
          }
          return [undefined, { ...current, query }];
        }),

      getState: (): Effect.Effect<PickerState | null> =>
        SubscriptionRef.get(ref),

      subscribe: (): Effect.Effect<Stream.Stream<PickerState | null>> =>
        Effect.succeed(ref.changes),

      selectType: (typeId: Id.Node): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(ref);
          if (!state) return; // No picker open, nothing to do

          const TypePicker = yield* TypePickerT;

          // Parse blockId to get nodeId
          const blockContext = Id.parseBlockContextSync(state.elementId);
          const nodeId =
            blockContext.type === "buffer"
              ? blockContext.nodeId
              : blockContext.hostNodeId;

          // Apply the type
          const viewId = yield* TypePicker.applyType(nodeId, typeId);

          // Auto-switch to the created view
          if (viewId) {
            yield* Buffer.setActiveView(blockContext.bufferId, viewId);
          }

          // Cleanup: delete trigger text, set selection, close picker
          yield* finishPickerAction(state, ref);
        }).pipe(
          Effect.provide(context),
          Effect.catchAll(() => Effect.void),
        ),

      createAndSelectType: (name: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const state = yield* SubscriptionRef.get(ref);
          if (!state) return; // No picker open, nothing to do

          const TypePicker = yield* TypePickerT;

          // Parse blockId to get nodeId
          const blockContext = Id.parseBlockContextSync(state.elementId);
          const nodeId =
            blockContext.type === "buffer"
              ? blockContext.nodeId
              : blockContext.hostNodeId;

          // Create the type
          const typeId = yield* TypePicker.createType(name);

          // Apply the type
          const viewId = yield* TypePicker.applyType(nodeId, typeId);

          // Auto-switch to the created view
          if (viewId) {
            yield* Buffer.setActiveView(blockContext.bufferId, viewId);
          }

          // Cleanup: delete trigger text, set selection, close picker
          yield* finishPickerAction(state, ref);
        }).pipe(
          Effect.provide(context),
          Effect.catchAll(() => Effect.void),
        ),
    };
  }),
);
