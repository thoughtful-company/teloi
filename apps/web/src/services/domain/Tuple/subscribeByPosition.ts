import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Layer, Option, Stream } from "effect";
import { get } from "./get";
import { Tuple } from "./types";

/**
 * Subscribe to tuples of a given type where a specific position has a specific value.
 *
 * When `sortByPosition` is specified, results are sorted by that position's
 * fractional index (ascending lexicographic).
 */
export const subscribeByPosition = (
  tupleTypeId: Id.Node,
  position: number,
  nodeId: Id.Node,
  sortByPosition?: number,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const storeLayer = Layer.succeed(StoreT, Store);

    const membersQuery = queryDb(
      tables.tupleMembers.select().where({ position, nodeId }),
      {
        label: `tuple-members-${position}-${nodeId}`,
        deps: [position, nodeId],
      },
    );

    const membersStream = yield* Store.subscribeStream(membersQuery);

    return membersStream.pipe(
      Stream.mapEffect((members) =>
        Effect.gen(function* () {
          const result: Tuple[] = [];

          for (const member of members) {
            const maybeTuple = yield* get(member.tupleId as Id.Tuple).pipe(
              Effect.provide(storeLayer),
            );
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
        }),
      ),
    );
  }).pipe(Effect.orDie);
