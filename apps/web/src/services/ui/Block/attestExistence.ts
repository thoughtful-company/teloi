import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { BlockNotFoundError } from "./errors";

export const attestExistence = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.block
        .select("id")
        .where("id", "=", blockId)
        .first({ fallback: () => null }),
    );

    const block = yield* Store.query(query);

    if (block === null) {
      return yield* Effect.fail(new BlockNotFoundError({ blockId }));
    }
  });
