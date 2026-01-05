import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/**
 * Add an allowed type constraint to a role position.
 * A role can have multiple allowed types (OR constraint).
 * Idempotent - no-op if already exists.
 */
export const addAllowedType = (
  tupleTypeId: Id.Node,
  position: number,
  allowedTypeId: Id.Node,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const existing = yield* Store.query(
      tables.tupleTypeRoleAllowedTypes
        .select()
        .where({ tupleTypeId, position, allowedTypeId })
        .first({ fallback: () => null }),
    );

    if (existing) {
      return;
    }

    yield* Store.commit(
      events.tupleTypeRoleAllowedTypeAdded({
        timestamp: Date.now(),
        data: {
          tupleTypeId,
          position,
          allowedTypeId,
        },
      }),
    );
  });
