import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { Effect } from "effect";

/**
 * Focus a block element from pointer activation.
 */
export const focusKhora = Effect.fn("focusKhora")(function* (params: {
  frameId: Id.Frame;
  nodeId: Id.Node;
  khoraId: Id.Khora;
  anchor?: number | undefined;
  head?: number | undefined;
  assoc?: 0 | 1 | -1 | undefined;
}) {
  const { khoraId, anchor, head, assoc } = params;
  const Frame = yield* FrameT;

  yield* Frame.enterBlockEditing(khoraId, {
    anchor: anchor ?? 0,
    head: head ?? anchor ?? 0,
    assoc: assoc ?? 0,
  });
});
