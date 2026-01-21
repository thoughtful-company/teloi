import { Id } from "@/schema";
import { Effect } from "effect";
import { get } from "./get";

/**
 * Get the display node from a tuple - the member that isn't the host node.
 * Used by property sections to resolve which node to render.
 */
export const getDisplayNode = (tupleId: Id.Tuple, hostNodeId: Id.Node) =>
  Effect.gen(function* () {
    const tuple = yield* get(tupleId);
    const displayNode = tuple.members.find((m) => m !== hostNodeId);
    if (!displayNode) {
      throw new Error(
        `Tuple ${tupleId} has no member other than host ${hostNodeId}`,
      );
    }
    return displayNode;
  });
