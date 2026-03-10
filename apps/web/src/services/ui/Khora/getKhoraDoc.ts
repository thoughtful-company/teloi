import { Id, Model } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

const KHORA_DOC_DEFAULTS: Model.Khora = {
  isExpanded: true,
  activeViewId: null,
  ghostChildId: null,
  ghostParentId: null,
};

/** Read a block document with defaults applied. Standalone helper for use in navigation. */
export const getKhoraDoc = (
  frameId: Id.Frame,
  nodeId: Id.Node,
): Effect.Effect<Model.Khora, never, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const khoraId = Id.makeFrameKhoraId(frameId, nodeId);
    const doc = yield* Store.getDocument("khora", khoraId);
    if (Option.isNone(doc)) return KHORA_DOC_DEFAULTS;
    return { ...KHORA_DOC_DEFAULTS, ...doc.value };
  });
