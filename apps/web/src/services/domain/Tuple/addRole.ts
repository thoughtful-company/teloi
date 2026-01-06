import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/**
 * Define or update a role/position in a TupleType schema.
 * Creates the role if it doesn't exist, updates if values differ.
 */
export const addRole = (
  tupleTypeId: Id.Node,
  position: number,
  name: string,
  required: boolean,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const existing = yield* Store.query(
      tables.tupleTypeRoles
        .select()
        .where({ tupleTypeId, position })
        .first({ fallback: () => null }),
    );

    if (existing) {
      const needsUpdate =
        existing.name !== name || existing.required !== required;
      if (needsUpdate) {
        yield* Store.commit(
          events.tupleTypeRoleUpdated({
            timestamp: Date.now(),
            data: {
              tupleTypeId,
              position,
              name,
              required,
            },
          }),
        );
      }
      return;
    }

    yield* Store.commit(
      events.tupleTypeRoleAdded({
        timestamp: Date.now(),
        data: {
          tupleTypeId,
          position,
          name,
          required,
        },
      }),
    );
  });
