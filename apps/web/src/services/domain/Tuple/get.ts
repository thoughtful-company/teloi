import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { Tuple } from "./types";

export const get = (tupleId: Id.Tuple) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const tuple = yield* Store.query(
      tables.tuples
        .select()
        .where({ id: tupleId })
        .first({ fallback: () => null }),
    );

    if (!tuple) return Option.none<Tuple>();

    const members = yield* Store.query(
      tables.tupleMembers
        .select()
        .where({ tupleId: tuple.id })
        .orderBy("position", "asc"),
    );

    return Option.some({
      id: tuple.id as Id.Tuple,
      tupleTypeId: tuple.tupleTypeId as Id.Node,
      members: members.map((m) => m.nodeId as Id.Node),
      memberFractionalIndices: members.map(
        (m) => (m.fractionalIndex as string) ?? "",
      ),
      createdAt: tuple.createdAt,
    } satisfies Tuple);
  });
