import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { TupleTypeRole } from "./types";

/**
 * Get the schema for a TupleType - all roles with their allowed types.
 */
export const getRoles = (tupleTypeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    // Get all roles for this tuple type
    const roles = yield* Store.query(
      tables.tupleTypeRoles
        .select()
        .where({ tupleTypeId })
        .orderBy("position", "asc"),
    );

    // Get allowed types for each role
    const result: TupleTypeRole[] = [];
    for (const role of roles) {
      const allowedTypes = yield* Store.query(
        tables.tupleTypeRoleAllowedTypes
          .select()
          .where({ tupleTypeId, position: role.position }),
      );

      result.push({
        tupleTypeId: role.tupleTypeId as Id.Node,
        position: role.position,
        name: role.name,
        required: role.required,
        allowedTypeIds: allowedTypes.map((t) => t.allowedTypeId as Id.Node),
        createdAt: role.createdAt,
      });
    }

    return result as readonly TupleTypeRole[];
  });
