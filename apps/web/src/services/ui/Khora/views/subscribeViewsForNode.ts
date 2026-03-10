import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect, Stream } from "effect";

/**
 * Subscribe to views for a node.
 * Emits whenever HAS_VIEW tuples change for the given node.
 */
export const subscribeViewsForNode = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // Subscribe to HAS_VIEW tuples where position 0 = nodeId
    const hasViewStream = yield* Tuple.subscribeByPosition(
      System.HAS_VIEW,
      0,
      nodeId,
    );

    // Map tuple changes to view IDs
    return Stream.map(hasViewStream, (tuples) =>
      tuples.map((tuple) => tuple.members[1] as Id.Node),
    );
  });
