import { Data } from "effect";
import { Id } from "@/schema";

/**
 * A role definition within a TupleType schema.
 * Defines what goes in a specific position of a tuple.
 */
export interface TupleTypeRole {
  tupleTypeId: Id.Node;
  position: number;
  name: string;
  required: boolean;
  allowedTypeIds: readonly Id.Node[];
  createdAt: number;
}

/**
 * A tuple instance - a fact relating multiple nodes.
 */
export interface Tuple {
  id: Id.Tuple;
  tupleTypeId: Id.Node;
  members: readonly Id.Node[];
  createdAt: number;
}

export class TupleNotFoundError extends Data.TaggedError("TupleNotFoundError")<{
  tupleId: Id.Tuple;
}> {}
