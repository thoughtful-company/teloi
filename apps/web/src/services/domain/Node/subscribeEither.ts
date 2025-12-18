import { tables, TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Either, Stream } from "effect";
import { NodeNotFoundError } from "../errors";

export const subscribeEither = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.nodes.select().where({ id: nodeId }).first({ fallback: () => null }),
      { label: `node-either-${nodeId}`, deps: [nodeId] },
    );

    const stream = yield* Store.subscribeStream(query);

    return stream.pipe(
      Stream.map(
        (node): Either.Either<TeloiNode, NodeNotFoundError> =>
          node == null
            ? Either.left(new NodeNotFoundError({ nodeId }))
            : Either.right(node),
      ),
    );
  }).pipe(Effect.orDie);
