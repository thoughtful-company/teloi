import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/** Types that cannot be removed once applied */
const NON_REMOVABLE_TYPES = new Set<Id.Node>([System.CHAT]);

export const removeType = (nodeId: Id.Node, typeId: Id.Node) =>
  Effect.gen(function* () {
    if (NON_REMOVABLE_TYPES.has(typeId)) {
      yield* Effect.logDebug(
        "[Type.removeType] Blocked removal of non-removable type",
      ).pipe(Effect.annotateLogs({ nodeId, typeId }));
      return;
    }

    const Store = yield* StoreT;

    yield* Store.commit(
      events.typeRemovedFromNode({
        timestamp: Date.now(),
        data: {
          nodeId,
          typeId,
        },
      }),
    );
  });
