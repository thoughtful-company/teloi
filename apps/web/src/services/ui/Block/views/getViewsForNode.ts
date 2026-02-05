import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect } from "effect";

/**
 * Get all views for a node via HAS_VIEW tuples.
 * Returns the view node IDs (position 1) where the node (position 0) matches.
 */
export const getViewsForNode = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // HAS_VIEW schema: (node, view) - position 0 is the node
    const tuples = yield* Tuple.findByPosition(System.HAS_VIEW, 0, nodeId);

    // Extract view node IDs from position 1
    return tuples.map((tuple) => tuple.members[1] as Id.Node);
  });
