import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect } from "effect";

/**
 * Get linked blocks for a property on a given page.
 * Queries tuple instances of the bound tuple type where the page
 * is at the hostPosition, returns node IDs from the displayPosition.
 */
export const getLinkedBlocks = (propertyId: Id.Node, pageId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // Get binding info from PROPERTY_USES_TUPLE
    const usesTupleTuples = yield* Tuple.findByPosition(
      System.PROPERTY_USES_TUPLE,
      0,
      propertyId,
    );

    if (usesTupleTuples.length === 0) {
      // Property is not bound - no linked blocks
      return [] as readonly Id.Node[];
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

    // Extract nodes from displayPosition
    return tupleInstances.map(
      (tuple) => tuple.members[displayPosition] as Id.Node,
    );
  });
