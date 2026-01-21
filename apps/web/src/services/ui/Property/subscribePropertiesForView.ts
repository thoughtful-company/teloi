import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option, Stream } from "effect";
import { getPropertyConfig } from "./getPropertyConfig";
import { PropertyInfo } from "./index";

/**
 * Subscribe to properties for a view.
 * Emits whenever HAS_PROPERTY tuples change for the given view.
 */
export const subscribePropertiesForView = (viewId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // Subscribe to HAS_PROPERTY tuples where position 0 = viewId
    const hasPropertyStream = yield* Tuple.subscribeByPosition(
      System.HAS_PROPERTY,
      0,
      viewId,
    );

    // Map tuple changes to PropertyInfo[]
    return Stream.mapEffect(hasPropertyStream, (tuples) =>
      Effect.gen(function* () {
        const properties: PropertyInfo[] = [];

        for (const tuple of tuples) {
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
      }),
    );
  });
