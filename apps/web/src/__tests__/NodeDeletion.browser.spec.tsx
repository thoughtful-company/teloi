import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { Given, runtime } from "./bdd";

describe("Node Deletion", () => {
  describe("tupleTypeRoleAllowedTypes cleanup", () => {
    it("removes allowedTypeId references when the allowed type node is deleted", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;

        // Create a tuple type node
        const { nodeId: tupleTypeId } =
          yield* Given.A_BUFFER_WITH_TEXT("TupleType");

        // Create a type node that will be used as an allowed type
        const { nodeId: allowedTypeId } =
          yield* Given.A_BUFFER_WITH_TEXT("AllowedType");

        // Add a role to the tuple type
        yield* Store.commit(
          events.tupleTypeRoleAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId,
              position: 0,
              name: "role1",
              required: true,
            },
          }),
        );

        // Add the allowed type to the role
        yield* Store.commit(
          events.tupleTypeRoleAllowedTypeAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId,
              position: 0,
              allowedTypeId,
            },
          }),
        );

        // Verify the allowed type reference exists
        const beforeDeletion = yield* Store.query(
          queryDb(
            tables.tupleTypeRoleAllowedTypes
              .select()
              .where({ allowedTypeId }),
          ),
        );
        expect(beforeDeletion).toHaveLength(1);
        expect(beforeDeletion[0]?.tupleTypeId).toBe(tupleTypeId);

        // Delete the allowed type node
        yield* Store.commit(
          events.nodeDeleted({
            timestamp: Date.now(),
            data: { nodeId: allowedTypeId },
          }),
        );

        // Verify the allowed type reference is cleaned up
        const afterDeletion = yield* Store.query(
          queryDb(
            tables.tupleTypeRoleAllowedTypes
              .select()
              .where({ allowedTypeId }),
          ),
        );
        expect(afterDeletion).toHaveLength(0);
      }).pipe(runtime.runPromise);
    });

    it("removes tupleTypeId references when the tuple type node is deleted", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;

        // Create a tuple type node
        const { nodeId: tupleTypeId } =
          yield* Given.A_BUFFER_WITH_TEXT("TupleType");

        // Create a type node that will be used as an allowed type
        const { nodeId: allowedTypeId } =
          yield* Given.A_BUFFER_WITH_TEXT("AllowedType");

        // Add a role to the tuple type
        yield* Store.commit(
          events.tupleTypeRoleAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId,
              position: 0,
              name: "role1",
              required: true,
            },
          }),
        );

        // Add the allowed type to the role
        yield* Store.commit(
          events.tupleTypeRoleAllowedTypeAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId,
              position: 0,
              allowedTypeId,
            },
          }),
        );

        // Verify the reference exists
        const beforeDeletion = yield* Store.query(
          queryDb(
            tables.tupleTypeRoleAllowedTypes
              .select()
              .where({ tupleTypeId }),
          ),
        );
        expect(beforeDeletion).toHaveLength(1);

        // Delete the tuple type node
        yield* Store.commit(
          events.nodeDeleted({
            timestamp: Date.now(),
            data: { nodeId: tupleTypeId },
          }),
        );

        // Verify references are cleaned up (this tests the existing tupleTypeId cleanup)
        const afterDeletion = yield* Store.query(
          queryDb(
            tables.tupleTypeRoleAllowedTypes
              .select()
              .where({ tupleTypeId }),
          ),
        );
        expect(afterDeletion).toHaveLength(0);
      }).pipe(runtime.runPromise);
    });
  });
});
