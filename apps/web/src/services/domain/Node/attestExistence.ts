import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, pipe } from "effect";
import { NodeNotFoundError } from "../errors";

export const attestExistence = Effect.fn("attestExistence")(function* (
  nodeId: Id.Node,
) {
  const Store = yield* StoreT;
  const query = queryDb(
    tables.nodes
      .select()
      .where({
        id: nodeId,
      })
      .first({ fallback: () => null }),
    { label: `node-${nodeId}`, deps: [nodeId] },
  );

  return yield* pipe(
    Store.query(query),
    Effect.filterOrFail(
      (b) => b !== null,
      () => new NodeNotFoundError({ nodeId }),
    ),
    Effect.asVoid,
  );
});
