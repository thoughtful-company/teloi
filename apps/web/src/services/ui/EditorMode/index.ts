/**
 * EditorModeT - Single source of truth for editor interaction mode.
 *
 * Replaces scattered focus state management with a unified service.
 * Components subscribe to mode changes and ActionT routes based on mode.
 *
 * Design decisions:
 * - No separate "title" variant: Title IS a block where nodeId === buffer.assignedNodeId
 * - No selectedNodes in blockSelection: Read from buffer.selectedBlocks in LiveStore
 * - Atomic transitions prevent race conditions between blur and mode changes
 */

import { Id } from "@/schema";
import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect";

/**
 * Editor interaction mode.
 *
 * - "none": No element focused
 * - "block": Block is focused for text editing
 * - "blockSelection": Buffer has block selection mode active (no text editor focused)
 */
export type EditorMode =
  | { type: "none" }
  | { type: "block"; blockId: Id.Block }
  | { type: "blockSelection"; bufferId: Id.Buffer };

export class EditorModeT extends Context.Tag("EditorModeT")<
  EditorModeT,
  {
    /**
     * Get the current editor mode synchronously.
     */
    get: () => Effect.Effect<EditorMode>;

    /**
     * Set the editor mode.
     */
    set: (mode: EditorMode) => Effect.Effect<void>;

    /**
     * Subscribe to mode changes.
     */
    subscribe: () => Effect.Effect<Stream.Stream<EditorMode>>;

    /**
     * Atomic transition into block selection mode.
     * Sets an internal flag to skip blur handlers during the transition.
     */
    enterBlockSelection: (bufferId: Id.Buffer) => Effect.Effect<void>;

    /**
     * Atomic transition out of block selection mode to a specific block.
     * Clears the skip-blur flag.
     */
    exitBlockSelection: (targetBlockId: Id.Block) => Effect.Effect<void>;

    /**
     * Check if blur should be skipped (during atomic transitions).
     * Used by focus/blur handlers to avoid race conditions.
     */
    shouldSkipBlur: () => Effect.Effect<boolean>;
  }
>() {}

export const EditorModeLive = Layer.effect(
  EditorModeT,
  Effect.gen(function* () {
    const modeRef = yield* SubscriptionRef.make<EditorMode>({ type: "none" });

    // Flag to skip blur handlers during atomic transitions
    // This prevents the blur handler from clearing state when we're
    // intentionally transitioning modes (e.g., Escape to block selection)
    let skipBlur = false;

    return {
      get: (): Effect.Effect<EditorMode> => SubscriptionRef.get(modeRef),

      set: (mode: EditorMode): Effect.Effect<void> =>
        SubscriptionRef.set(modeRef, mode),

      subscribe: (): Effect.Effect<Stream.Stream<EditorMode>> =>
        Effect.succeed(modeRef.changes),

      enterBlockSelection: (bufferId: Id.Buffer): Effect.Effect<void> =>
        Effect.sync(() => {
          // Set flag BEFORE mode change to prevent blur from firing
          skipBlur = true;
        }).pipe(
          Effect.flatMap(() =>
            SubscriptionRef.set(modeRef, { type: "blockSelection", bufferId }),
          ),
          // Clear flag after a microtask to allow the transition to complete
          Effect.tap(() =>
            Effect.sync(() => {
              queueMicrotask(() => {
                skipBlur = false;
              });
            }),
          ),
        ),

      exitBlockSelection: (targetBlockId: Id.Block): Effect.Effect<void> =>
        SubscriptionRef.set(modeRef, { type: "block", blockId: targetBlockId }),

      shouldSkipBlur: (): Effect.Effect<boolean> => Effect.sync(() => skipBlur),
    };
  }),
);
