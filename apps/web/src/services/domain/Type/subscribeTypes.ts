import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";

export const subscribeTypes = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.nodeTypes
        .select()
        .where({ nodeId })
        .orderBy("position", "asc"),
      { label: `types-${nodeId}`, deps: [nodeId] },
    );

    const stream = yield* Store.subscribeStream(query);

    return stream.pipe(Stream.map((rows) => rows.map((r) => r.typeId as Id.Node)));
  }).pipe(Effect.orDie);
