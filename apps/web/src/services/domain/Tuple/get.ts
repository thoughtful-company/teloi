import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { Tuple, TupleNotFoundError } from "./types";

/**
 * Get a tuple by ID.
 */
export const get = (tupleId: Id.Tuple) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const tuple = yield* Store.query(
      tables.tuples
        .select()
        .where({ id: tupleId })
        .first({ fallback: () => null }),
    );

    if (!tuple) {
      return yield* Effect.fail(new TupleNotFoundError({ tupleId }));
    }

    const members = yield* Store.query(
      tables.tupleMembers
        .select()
        .where({ tupleId: tuple.id })
        .orderBy("position", "asc"),
    );

    return {
      id: tuple.id as Id.Tuple,
      tupleTypeId: tuple.tupleTypeId as Id.Node,
      members: members.map((m) => m.nodeId as Id.Node),
      createdAt: tuple.createdAt,
    } satisfies Tuple;
  });
