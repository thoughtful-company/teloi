import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

export const getTypes = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const types = yield* Store.query(
      tables.nodeTypes.select().where({ nodeId }).orderBy("position", "asc"),
    );
    return types.map((t) => t.typeId as Id.Node);
  });
