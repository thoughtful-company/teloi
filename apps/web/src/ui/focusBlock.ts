import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { waitFrames } from "@/utils/effect";
import { Effect, Option } from "effect";

/**
 * Focus a block element from a mousedown handler.
 *
 * Defers frame focus by one rAF so LiveStore processes the
 * selection update before CodeMirror mounts with view.focus().
 */
export const focusBlock = Effect.fn("focusBlock")(function* (params: {
  frameId: Id.Frame;
  nodeId: Id.Node;
  blockId: Id.Block;
  offset?: number | undefined;
  assoc?: 0 | 1 | -1 | undefined;
}) {
  const { frameId, nodeId, blockId, offset, assoc } = params;
  const Frame = yield* FrameT;

  yield* Frame.setBlockSelection(frameId, [], nodeId);
  yield* Frame.setSelection(
    frameId,
    Option.some({
      anchor: { elementId: blockId },
      anchorOffset: offset ?? 0,
      focus: { elementId: blockId },
      focusOffset: offset ?? 0,
      goalX: null,
      goalLine: null,
      assoc: assoc ?? 0,
    }),
  );
  yield* Effect.forkDaemon(
    waitFrames(1).pipe(
      Effect.andThen(Frame.enterBlockEditing(blockId)),
    ),
  );
});
