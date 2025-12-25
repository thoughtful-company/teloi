import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { NodeHasNoParentError } from "../errors";

/**
 * Get the parent ID of a node.
 * Returns NodeHasNoParentError if the node has no parent (root node).
 */
export const getParent = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const link = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ childId: nodeId })
        .first({ fallback: () => null }),
    );

    if (!link || !link.parentId) {
      return yield* Effect.fail(new NodeHasNoParentError({ nodeId }));
    }

    return link.parentId as Id.Node;
  });
