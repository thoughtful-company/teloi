import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect, Option } from "effect";

export interface PropertyConfig {
  tupleTypeId: Id.Node;
  hostPosition: 0 | 1;
  displayPosition: 0 | 1;
}

export type TupleService = Effect.Effect.Success<typeof TupleT>;

/**
 * Get the configuration for a property.
 * Returns the bound tuple type and position configuration.
 * Returns None if property is not bound to a tuple type.
 */
export const getPropertyConfig = (propertyId: Id.Node, Tuple: TupleService) =>
  Effect.gen(function* () {
    // Get binding info from PROPERTY_USES_TUPLE
    const usesTupleTuples = yield* Tuple.findByPosition(
      System.PROPERTY_USES_TUPLE,
      0,
      propertyId,
    );

    if (usesTupleTuples.length === 0) {
      return Option.none<PropertyConfig>();
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

    return Option.some<PropertyConfig>({ tupleTypeId, hostPosition, displayPosition });
  });
