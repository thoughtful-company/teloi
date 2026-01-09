import { tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";

export const subscribeRootNodes = () =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.parentLinks
        .select()
        .where({ parentId: System.WORKSPACE })
        .orderBy("position", "asc"),
      { label: "workspace-pages" },
    );

    const stream = yield* Store.subscribeStream(query);

    return stream.pipe(
      Stream.map((rows) => rows.map((r) => r.childId as Id.Node)),
    );
  }).pipe(Effect.orDie);
