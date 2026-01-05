import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";
import { Tuple } from "./types";

/**
 * Subscribe to tuples of a given type where a specific position has a specific value.
 * Returns a stream that emits whenever relevant tuples change.
 */
export const subscribeByPosition = (
  tupleTypeId: Id.Node,
  position: number,
  nodeId: Id.Node,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    // Subscribe to tuple_members matching position + nodeId
    const membersQuery = queryDb(
      tables.tupleMembers.select().where({ position, nodeId }),
      {
        label: `tuple-members-${position}-${nodeId}`,
        deps: [position, nodeId],
      },
    );

    const membersStream = yield* Store.subscribeStream(membersQuery);

    // For each emission, look up full tuple data
    return membersStream.pipe(
      Stream.mapEffect((members) =>
        Effect.gen(function* () {
          const result: Tuple[] = [];

          for (const member of members) {
            const tuple = yield* Store.query(
              tables.tuples
                .select()
                .where({ id: member.tupleId, tupleTypeId })
                .first({ fallback: () => null }),
            );

            if (tuple) {
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
        }),
      ),
    );
  }).pipe(Effect.orDie);
