import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { KhoraNotFoundError } from "./errors";

export const attestExistence = (khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.khora
        .select("id")
        .where("id", "=", khoraId)
        .first({ fallback: () => null }),
    );

    const block = yield* Store.query(query);

    if (block === null) {
      return yield* Effect.fail(new KhoraNotFoundError({ khoraId }));
    }
  });
