import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { getNodeChildren } from "./getNodeChildren";

/**
 * Recursively collects all descendant node IDs in depth-first pre-order.
 * Does NOT include the root nodeId itself.
 */
export const getAllDescendants = (
  nodeId: Id.Node,
): Effect.Effect<readonly Id.Node[], never, StoreT> =>
  Effect.gen(function* () {
    const children = yield* getNodeChildren(nodeId);
    const descendants: Id.Node[] = [];

    for (const childId of children) {
      descendants.push(childId);
      const childDescendants = yield* getAllDescendants(childId);
      descendants.push(...childDescendants);
    }

    return descendants;
  });
