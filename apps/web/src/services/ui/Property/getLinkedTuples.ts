import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect, Option } from "effect";
import { getPropertyConfig } from "./getPropertyConfig";

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

    const configOpt = yield* getPropertyConfig(propertyId, Tuple);
    if (Option.isNone(configOpt)) {
      const empty: readonly LinkedTuple[] = [];
      return empty;
    }

    const { tupleTypeId, hostPosition, displayPosition } = configOpt.value;

    const tupleInstances = yield* Tuple.findByPosition(
      tupleTypeId,
      hostPosition,
      pageId,
    );

    return tupleInstances.map((tuple) => {
      const displayNodeId = tuple.members[displayPosition];
      if (!displayNodeId) {
        throw new Error(
          `Tuple ${tuple.id} is missing display member at position ${displayPosition}`,
        );
      }

      return {
        tupleId: tuple.id,
        displayNodeId,
      };
    });
  });
