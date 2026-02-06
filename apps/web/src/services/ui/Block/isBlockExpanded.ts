import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

export const isBlockExpanded = (
  frameId: Id.Frame,
  nodeId: Id.Node,
): Effect.Effect<boolean, never, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockId = Id.makeFrameBlockId(frameId, nodeId);
    const blockDoc = yield* Store.getDocument("block", blockId);
    if (Option.isNone(blockDoc)) return true;
    return blockDoc.value.isExpanded;
  });
