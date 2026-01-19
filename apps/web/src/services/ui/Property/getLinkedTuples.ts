import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect } from "effect";

/**
 * Represents a linked tuple relationship for a property section.
 * The tupleId identifies the relationship, displayNodeId is the node to render.
 */
export interface LinkedTuple {
  tupleId: Id.Tuple;
  displayNodeId: Id.Node;
}

/**
 * Get linked tuples for a property on a given page.
 * Returns tuple instances with their IDs and the display node for rendering.
 *
 * This replaces getLinkedBlocks - the key insight is that linked blocks
 * represent tuple instances (relationships), not just nodes.
 */
export const getLinkedTuples = (propertyId: Id.Node, pageId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // Get binding info from PROPERTY_USES_TUPLE
    const usesTupleTuples = yield* Tuple.findByPosition(
      System.PROPERTY_USES_TUPLE,
      0,
      propertyId,
    );

    if (usesTupleTuples.length === 0) {
      // Property is not bound - no linked tuples
      return [] as readonly LinkedTuple[];
    }

    const tupleTypeId = usesTupleTuples[0]!.members[1] as Id.Node;

    // Get position config from PROPERTY_CONFIG
    const configTuples = yield* Tuple.findByPosition(
      System.PROPERTY_CONFIG,
      0,
      propertyId,
    );

    let hostPosition: 0 | 1 = 0;
    let displayPosition: 0 | 1 = 1;

    if (configTuples.length > 0) {
      const config = configTuples[0]!;
      hostPosition = config.members[1] === System.POSITION_0 ? 0 : 1;
      displayPosition = config.members[2] === System.POSITION_0 ? 0 : 1;
    }

    // Query tuple instances where page is at hostPosition
    const tupleInstances = yield* Tuple.findByPosition(
      tupleTypeId,
      hostPosition,
      pageId,
    );

    // Return both tupleId and displayNodeId
    return tupleInstances.map((tuple) => ({
      tupleId: tuple.id,
      displayNodeId: tuple.members[displayPosition] as Id.Node,
    }));
  });
