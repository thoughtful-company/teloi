import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/**
 * Delete a tuple by ID.
 */
export const deleteTuple = (tupleId: Id.Tuple) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    yield* Store.commit(
      events.tupleDeleted({
        timestamp: Date.now(),
        data: {
          tupleId,
        },
      }),
    );
  });
