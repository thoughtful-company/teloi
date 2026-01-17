import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { Effect } from "effect";
import { PropertyInfo } from "./index";

/**
 * Get all properties for a view via HAS_PROPERTY tuples.
 * Returns PropertyInfo with title, binding status, and configuration.
 */
export const getPropertiesForView = (viewId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // Query HAS_PROPERTY tuples where position 0 = viewId
    const hasPropertyTuples = yield* Tuple.findByPosition(
      System.HAS_PROPERTY,
      0,
      viewId,
    );

    const properties: PropertyInfo[] = [];

    for (const tuple of hasPropertyTuples) {
      const propertyId = tuple.members[1] as Id.Node;

      // Get title from Yjs
      const ytext = Yjs.getText(propertyId);
      const title = ytext.toString();

      // Check if property is bound via PROPERTY_USES_TUPLE
      const usesTupleTuples = yield* Tuple.findByPosition(
        System.PROPERTY_USES_TUPLE,
        0,
        propertyId,
      );

      if (usesTupleTuples.length === 0) {
        // Unbound property
        properties.push({
          id: propertyId,
          title,
          isBound: false,
        });
      } else {
        // Bound property - get tuple type and config
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

        properties.push({
          id: propertyId,
          title,
          isBound: true,
          tupleTypeId,
          hostPosition,
          displayPosition,
        });
      }
    }

    return properties;
  });
