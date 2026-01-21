import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect, Option } from "effect";
import { getPropertyConfig } from "./getPropertyConfig";

/**
 * Get linked blocks for a property on a given page.
 * Queries tuple instances of the bound tuple type where the page
 * is at the hostPosition, returns node IDs from the displayPosition.
 */
export const getLinkedBlocks = (propertyId: Id.Node, pageId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    const configOpt = yield* getPropertyConfig(propertyId, Tuple);
    if (Option.isNone(configOpt)) {
      return [] as readonly Id.Node[];
    }

    const { tupleTypeId, hostPosition, displayPosition } = configOpt.value;

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
