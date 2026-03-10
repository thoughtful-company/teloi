import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

export const isKhoraExpanded = (
  frameId: Id.Frame,
  nodeId: Id.Node,
): Effect.Effect<boolean, never, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const khoraId = Id.makeFrameKhoraId(frameId, nodeId);
    const blockDoc = yield* Store.getDocument("khora", khoraId);
    if (Option.isNone(blockDoc)) return true;
    return blockDoc.value.isExpanded;
  });
