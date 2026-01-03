import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

export const removeType = (nodeId: Id.Node, typeId: Id.Node) =>
  Effect.gen(function* () {
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
