import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { TitleLink } from "./index";

export const get = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.titleLinks.select().where({ nodeId }).first(),
      { label: `title-link-${nodeId}`, deps: [nodeId] },
    );

    const row = yield* Store.query(query);

    if (!row) {
      return null;
    }

    return {
      sourceId: row.sourceId as Id.Node,
      mode: row.mode as TitleLink["mode"],
    };
  }).pipe(Effect.orDie);
