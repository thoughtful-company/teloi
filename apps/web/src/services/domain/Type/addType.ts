import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";

const getLastTypePosition = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const lastType = yield* Store.query(
      tables.nodeTypes
        .select()
        .where({ nodeId })
        .orderBy("position", "desc")
        .first({ fallback: () => null }),
    );
    return lastType?.position ?? null;
  });

export const addType = (nodeId: Id.Node, typeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    // Check if type is already assigned
    const existing = yield* Store.query(
      tables.nodeTypes
        .select()
        .where({ nodeId, typeId })
        .first({ fallback: () => null }),
    );

    if (existing) {
      // Already has this type, no-op
      return;
    }

    // Get position at the end of the types list
    const lastPos = yield* getLastTypePosition(nodeId);
    const position = generateKeyBetween(lastPos, null);

    yield* Store.commit(
      events.typeAddedToNode({
        timestamp: Date.now(),
        data: {
          nodeId,
          typeId,
          position,
        },
      }),
    );
  });
