import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { isBlockExpanded } from "./isBlockExpanded";

/**
 * Recursively expand nodes level-by-level using DFS order.
 *
 * When invoked on a node:
 * 1. If the node's block is collapsed, expand it and return true
 * 2. If already expanded, check children (in order) for the first collapsed descendant
 * 3. Expand the first collapsed node found and return true
 * 4. If everything is already expanded, return false
 *
 * Used for keyboard shortcuts that progressively reveal a tree (Cmd+Down on a block).
 */
export const expandOneLevel = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
): Effect.Effect<boolean, never, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    const expand = (
      nId: Id.Node,
    ): Effect.Effect<boolean, never, StoreT | NodeT> =>
      Effect.gen(function* () {
        const isExpanded = yield* isBlockExpanded(bufferId, nId);

        if (!isExpanded) {
          const blockId = Id.makeBufferBlockId(bufferId, nId);
          yield* Store.setDocument("block", { isExpanded: true }, blockId).pipe(
            Effect.catchAll(() => Effect.void),
          );
          return true;
        }

        // Already expanded — try children in order (DFS)
        const children = yield* Node.getNodeChildren(nId);
        for (const childId of children) {
          const didExpand = yield* expand(childId);
          if (didExpand) return true;
        }

        return false;
      });

    return yield* expand(nodeId);
  });
