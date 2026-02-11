import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { Effect } from "effect";

/**
 * Focus a block element from pointer activation.
 */
export const focusBlock = Effect.fn("focusBlock")(function* (params: {
  frameId: Id.Frame;
  nodeId: Id.Node;
  blockId: Id.Block;
  anchor?: number | undefined;
  head?: number | undefined;
  assoc?: 0 | 1 | -1 | undefined;
}) {
  const { blockId, anchor, head, assoc } = params;
  const Frame = yield* FrameT;

  yield* Frame.enterBlockEditing(blockId, {
    anchor: anchor ?? 0,
    head: head ?? anchor ?? 0,
    assoc: assoc ?? 0,
  });
});
