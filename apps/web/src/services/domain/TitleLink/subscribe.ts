import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";
import { TitleLink } from "./index";

export const subscribe = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.titleLinks.select().where({ nodeId }),
      { label: `title-link-stream-${nodeId}`, deps: [nodeId] },
    );

    const stream = yield* Store.subscribeStream(query);

    return stream.pipe(
      Stream.map((rows): TitleLink | null => {
        const row = rows[0];
        if (!row) {
          return null;
        }
        return {
          sourceId: row.sourceId as Id.Node,
          mode: row.mode as TitleLink["mode"],
        };
      }),
    );
  }).pipe(Effect.orDie);
