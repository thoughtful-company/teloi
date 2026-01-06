import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/**
 * Create a new tuple instance with the given type and members.
 * Members are provided in position order.
 */
export const create = (tupleTypeId: Id.Node, members: readonly Id.Node[]) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const tupleId = Id.Tuple.make(crypto.randomUUID());

    yield* Store.commit(
      events.tupleCreated({
        timestamp: Date.now(),
        data: {
          tupleId,
          tupleTypeId,
          members: [...members],
        },
      }),
    );

    return tupleId;
  });
