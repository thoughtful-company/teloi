import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option } from "effect";
import { getPropertyConfig } from "./getPropertyConfig";
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

      const configOpt = yield* getPropertyConfig(propertyId, Tuple);

      if (Option.isNone(configOpt)) {
        // Unbound property
        properties.push({
          id: propertyId,
          title,
          isBound: false,
        });
      } else {
        // Bound property
        const { tupleTypeId, hostPosition, displayPosition } = configOpt.value;
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
