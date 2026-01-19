import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import * as Given from "../bdd/given";
import * as ThenModel from "../bdd/then-model";
import * as WhenModel from "../bdd/when-model";
import { setupUnitTest, type UnitRuntime } from "../unit/setup";

/**
 * Tests for node deletion behavior and cascading cleanup.
 * Verifies that related data (tuples, allowed types, etc.) is properly
 * cleaned up when nodes are deleted.
 */
describe("Node Deletion", () => {
  let runtime: UnitRuntime;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("tupleTypeRoleAllowedTypes cleanup", () => {
    it("removes allowedTypeId references when the allowed type node is deleted", async () => {
      await Effect.gen(function* () {
        // Given a tuple type with a role that allows a specific type
        const { tupleTypeId } = yield* Given.A_TUPLE_TYPE_WITH_ROLE(
          "TupleType",
          {
            position: 0,
            name: "role1",
            required: true,
          },
        );
        const { nodeId: allowedTypeId } =
          yield* Given.A_BUFFER_WITH_TEXT("AllowedType");
        yield* Given.TUPLE_TYPE_ALLOWS(tupleTypeId, 0, allowedTypeId);

        // When the allowed type node is deleted
        yield* WhenModel.NODE_IS_DELETED(allowedTypeId);

        // Then the allowed type reference should be cleaned up
        yield* ThenModel.NO_ALLOWED_TYPE_REFS_EXIST(allowedTypeId);
      }).pipe(runtime.runPromise);
    });

    it("removes tupleTypeId references when the tuple type node is deleted", async () => {
      await Effect.gen(function* () {
        // Given a tuple type with a role that allows a specific type
        const { tupleTypeId } = yield* Given.A_TUPLE_TYPE_WITH_ROLE(
          "TupleType",
          {
            position: 0,
            name: "role1",
            required: true,
          },
        );
        const { nodeId: allowedTypeId } =
          yield* Given.A_BUFFER_WITH_TEXT("AllowedType");
        yield* Given.TUPLE_TYPE_ALLOWS(tupleTypeId, 0, allowedTypeId);

        // When the tuple type node is deleted
        yield* WhenModel.NODE_IS_DELETED(tupleTypeId);

        // Then all allowed type references for this tuple type should be cleaned up
        yield* ThenModel.NO_ALLOWED_TYPES_FOR_TUPLE_TYPE(tupleTypeId);
      }).pipe(runtime.runPromise);
    });
  });

  describe("tuple instance cleanup", () => {
    it("removes tuple instances and members when their tuple type node is deleted", async () => {
      await Effect.gen(function* () {
        // Given a tuple type with a tuple instance
        const { tupleTypeId } = yield* Given.A_TUPLE_TYPE_WITH_ROLE(
          "TupleType",
          {
            position: 0,
            name: "role1",
            required: true,
          },
        );
        const { nodeId: member1Id } =
          yield* Given.A_BUFFER_WITH_TEXT("Member1");
        const { nodeId: member2Id } =
          yield* Given.A_BUFFER_WITH_TEXT("Member2");
        const { tupleId } = yield* Given.A_TUPLE_INSTANCE(tupleTypeId, [
          member1Id,
          member2Id,
        ]);

        // When the tuple type node is deleted
        yield* WhenModel.NODE_IS_DELETED(tupleTypeId);

        // Then the tuple instance and its members should be cleaned up
        yield* ThenModel.TUPLE_DOES_NOT_EXIST(tupleId);
        yield* ThenModel.NO_TUPLE_MEMBERS_EXIST(tupleId);
      }).pipe(runtime.runPromise);
    });
  });
});
