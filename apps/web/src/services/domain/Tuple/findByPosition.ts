import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { Tuple } from "./types";

/**
 * Find all tuples of a given type where a specific position has a specific value.
 * Useful for queries like "find all IS_CHECKED tuples where position 0 = nodeId".
 */
export const findByPosition = (
  tupleTypeId: Id.Node,
  position: number,
  nodeId: Id.Node,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    // Find tuple members matching the criteria
    const matchingMembers = yield* Store.query(
      tables.tupleMembers.select().where({ position, nodeId }),
    );

    // Filter to tuples of the right type and gather full tuple data
    const result: Tuple[] = [];
    for (const member of matchingMembers) {
      const tuple = yield* Store.query(
        tables.tuples
          .select()
          .where({ id: member.tupleId, tupleTypeId })
          .first({ fallback: () => null }),
      );

      if (tuple) {
        // Get all members for this tuple
        const allMembers = yield* Store.query(
          tables.tupleMembers
            .select()
            .where({ tupleId: tuple.id })
            .orderBy("position", "asc"),
        );

        result.push({
          id: tuple.id as Id.Tuple,
          tupleTypeId: tuple.tupleTypeId as Id.Node,
          members: allMembers.map((m) => m.nodeId as Id.Node),
          createdAt: tuple.createdAt,
        });
      }
    }

    return result as readonly Tuple[];
  });
