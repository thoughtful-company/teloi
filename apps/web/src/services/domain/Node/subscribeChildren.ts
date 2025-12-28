import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";

export const subscribeChildren = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.parentLinks
        .select()
        .where({ parentId: nodeId })
        .orderBy("position", "asc"),
      { label: `children-${nodeId}`, deps: [nodeId] },
    );

    const stream = yield* Store.subscribeStream(query);

    return stream.pipe(
      Stream.map((rows) => rows.map((r) => r.childId)),
    );
  }).pipe(Effect.orDie);
