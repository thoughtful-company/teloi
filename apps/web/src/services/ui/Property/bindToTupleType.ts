import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect } from "effect";

/**
 * Bind a property to a tuple type with position configuration.
 * - Creates PROPERTY_USES_TUPLE tuple linking property to tuple type
 * - Creates PROPERTY_CONFIG tuple with hostPosition and displayPosition
 */
export const bindToTupleType = (
  propertyId: Id.Node,
  tupleTypeId: Id.Node,
  hostPosition: 0 | 1,
  displayPosition: 0 | 1,
) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    // Convert positions to system node IDs
    const hostPositionNode =
      hostPosition === 0 ? System.POSITION_0 : System.POSITION_1;
    const displayPositionNode =
      displayPosition === 0 ? System.POSITION_0 : System.POSITION_1;

    // Create PROPERTY_USES_TUPLE tuple
    yield* Tuple.create(System.PROPERTY_USES_TUPLE, [propertyId, tupleTypeId]);

    // Create PROPERTY_CONFIG tuple
    yield* Tuple.create(System.PROPERTY_CONFIG, [
      propertyId,
      hostPositionNode,
      displayPositionNode,
    ]);
  });
