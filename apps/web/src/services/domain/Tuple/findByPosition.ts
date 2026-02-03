import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { get } from "./get";
import { Tuple } from "./types";

/**
 * Find all tuples of a given type where a specific position has a specific value.
 *
 * When `sortByPosition` is specified, results are sorted by that position's
 * fractional index (ascending lexicographic). Used for ordered collections
 * like chat messages: `findByPosition(CHAT_HAS_MESSAGE, 0, chatNodeId, 1)`.
 */
export const findByPosition = (
  tupleTypeId: Id.Node,
  position: number,
  nodeId: Id.Node,
  sortByPosition?: number,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const matchingMembers = yield* Store.query(
      tables.tupleMembers.select().where({ position, nodeId }),
    );

    const result: Tuple[] = [];
    for (const member of matchingMembers) {
      const maybeTuple = yield* get(member.tupleId as Id.Tuple);
      if (
        Option.isSome(maybeTuple) &&
        maybeTuple.value.tupleTypeId === tupleTypeId
      ) {
        result.push(maybeTuple.value);
      }
    }

    if (sortByPosition != null) {
      result.sort((a, b) => {
        const aIdx = a.memberFractionalIndices[sortByPosition] ?? "";
        const bIdx = b.memberFractionalIndices[sortByPosition] ?? "";
        return aIdx < bIdx ? -1 : aIdx > bIdx ? 1 : 0;
      });
    }

    return result as readonly Tuple[];
  });
