import { Id, Model } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

const BLOCK_DOC_DEFAULTS: Model.Block = {
  isExpanded: true,
  activeViewId: null,
  ghostChildId: null,
  ghostParentId: null,
};

/** Read a block document with defaults applied. Standalone helper for use in navigation. */
export const getBlockDoc = (
  frameId: Id.Frame,
  nodeId: Id.Node,
): Effect.Effect<Model.Block, never, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockId = Id.makeFrameBlockId(frameId, nodeId);
    const doc = yield* Store.getDocument("block", blockId);
    if (Option.isNone(doc)) return BLOCK_DOC_DEFAULTS;
    return { ...BLOCK_DOC_DEFAULTS, ...doc.value };
  });
