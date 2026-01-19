import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { expect } from "vitest";

/**
 * Headless Then assertions that operate directly on the model layer.
 * Use these for unit tests that don't need browser/DOM interaction.
 * For browser-based assertions (DOM queries, waitFor), use then.ts instead.
 */

/**
 * Asserts that no allowed type references exist for a node (as allowedTypeId).
 */
export const NO_ALLOWED_TYPE_REFS_EXIST = (allowedTypeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const refs = yield* Store.query(
      queryDb(
        tables.tupleTypeRoleAllowedTypes.select().where({ allowedTypeId }),
      ),
    );
    expect(refs).toHaveLength(0);
  }).pipe(Effect.withSpan("Then.NO_ALLOWED_TYPE_REFS_EXIST"));

/**
 * Asserts that no tuple type role allowed types exist for a tuple type.
 */
export const NO_ALLOWED_TYPES_FOR_TUPLE_TYPE = (tupleTypeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const refs = yield* Store.query(
      queryDb(tables.tupleTypeRoleAllowedTypes.select().where({ tupleTypeId })),
    );
    expect(refs).toHaveLength(0);
  }).pipe(Effect.withSpan("Then.NO_ALLOWED_TYPES_FOR_TUPLE_TYPE"));

/**
 * Asserts that no tuple instances exist for a given tuple type.
 */
export const NO_TUPLES_EXIST_FOR_TYPE = (tupleTypeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const tuples = yield* Store.query(
      queryDb(tables.tuples.select().where({ tupleTypeId })),
    );
    expect(tuples).toHaveLength(0);
  }).pipe(Effect.withSpan("Then.NO_TUPLES_EXIST_FOR_TYPE"));

/**
 * Asserts that no tuple members exist for a tuple.
 */
export const NO_TUPLE_MEMBERS_EXIST = (tupleId: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const members = yield* Store.query(
      queryDb(tables.tupleMembers.select().where({ tupleId })),
    );
    expect(members).toHaveLength(0);
  }).pipe(Effect.withSpan("Then.NO_TUPLE_MEMBERS_EXIST"));

/**
 * Asserts that a specific tuple does not exist.
 */
export const TUPLE_DOES_NOT_EXIST = (tupleId: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const tuple = yield* Store.query(
      queryDb(tables.tuples.select().where({ id: tupleId })),
    );
    expect(tuple).toHaveLength(0);
  }).pipe(Effect.withSpan("Then.TUPLE_DOES_NOT_EXIST"));
