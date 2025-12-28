import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";
import { NodeNotFoundError } from "../errors";

export const subscribe = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.nodes.select().where({ id: nodeId }).first({ fallback: () => null }),
      { label: `node-${nodeId}`, deps: [nodeId] },
    );

    const stream = yield* Store.subscribeStream(query);

    return stream.pipe(
      Stream.mapEffect((node) =>
        node == null
          ? Effect.fail(new NodeNotFoundError({ nodeId }))
          : Effect.succeed(node),
      ),
    );
  }).pipe(Effect.orDie);
