import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

export const hasType = (nodeId: Id.Node, typeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const existing = yield* Store.query(
      tables.nodeTypes
        .select()
        .where({ nodeId, typeId })
        .first({ fallback: () => null }),
    );
    return existing !== null;
  });
