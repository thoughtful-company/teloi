import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { addRole } from "./addRole";
import { addAllowedType } from "./addAllowedType";
import { getRoles } from "./getRoles";
import { create } from "./create";
import { deleteTuple } from "./delete";
import { findByPosition } from "./findByPosition";
import { subscribeByPosition } from "./subscribeByPosition";
import { get } from "./get";
import { Tuple, TupleNotFoundError, TupleTypeRole } from "./types";

export type { Tuple, TupleTypeRole } from "./types";
export { TupleNotFoundError } from "./types";

export class TupleT extends Context.Tag("TupleT")<
  TupleT,
  {
    // === TupleType Schema Operations ===

    /**
     * Define a role/position in a TupleType schema.
     * Idempotent - no-op if role already exists.
     */
    addRole: (
      tupleTypeId: Id.Node,
      position: number,
      name: string,
      required: boolean,
    ) => Effect.Effect<void>;

    /**
     * Add an allowed type constraint to a role position.
     * Multiple calls = multiple allowed types (OR constraint).
     */
    addAllowedType: (
      tupleTypeId: Id.Node,
      position: number,
      allowedTypeId: Id.Node,
    ) => Effect.Effect<void>;

    /**
     * Get the schema for a TupleType - all roles with their allowed types.
     */
    getRoles: (tupleTypeId: Id.Node) => Effect.Effect<readonly TupleTypeRole[]>;

    // === Tuple Instance Operations ===

    /**
     * Create a new tuple instance with the given type and members.
     * Members are provided in position order.
     */
    create: (
      tupleTypeId: Id.Node,
      members: readonly Id.Node[],
    ) => Effect.Effect<Id.Tuple>;

    /**
     * Delete a tuple by ID.
     */
    delete: (tupleId: Id.Tuple) => Effect.Effect<void>;

    /**
     * Find all tuples where a specific position has a specific value.
     */
    findByPosition: (
      tupleTypeId: Id.Node,
      position: number,
      nodeId: Id.Node,
    ) => Effect.Effect<readonly Tuple[]>;

    /**
     * Subscribe to tuples where a specific position has a specific value.
     */
    subscribeByPosition: (
      tupleTypeId: Id.Node,
      position: number,
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly Tuple[]>>;

    /**
     * Get a tuple by ID.
     */
    get: (tupleId: Id.Tuple) => Effect.Effect<Tuple, TupleNotFoundError>;
  }
>() {}

export const TupleLive = Layer.effect(
  TupleT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const context = Context.make(StoreT, Store);

    return {
      addRole: withContext(addRole)(context),
      addAllowedType: withContext(addAllowedType)(context),
      getRoles: withContext(getRoles)(context),
      create: withContext(create)(context),
      delete: withContext(deleteTuple)(context),
      findByPosition: withContext(findByPosition)(context),
      subscribeByPosition: withContext(subscribeByPosition)(context),
      get: withContext(get)(context),
    };
  }),
);
