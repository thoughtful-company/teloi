import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";
import { StoreT } from "../../external/Store";

/**
 * Expands all ancestor blocks between rootNodeId and targetNodeId.
 *
 * - rootNodeId is EXCLUDED (it's the buffer root, has no parent block to expand)
 * - targetNodeId is EXCLUDED (we expand ancestors, not the target itself)
 *
 * @param bufferId - The buffer ID (needed to construct block IDs)
 * @param rootNodeId - The buffer's assignedNodeId (stop here, don't expand)
 * @param targetNodeId - The node being selected (start traversal here)
 */
export const expandAncestors = (
  bufferId: Id.Buffer,
  rootNodeId: Id.Node,
  targetNodeId: Id.Node,
): Effect.Effect<void, never, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    // Collect ancestors from targetNodeId up to (but not including) rootNodeId
    const ancestorsToExpand: Id.Node[] = [];
    let currentId: Id.Node | null = targetNodeId;

    // Start by getting parent of target (we don't expand target itself)
    currentId = yield* Node.getParent(currentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    while (currentId !== null && currentId !== rootNodeId) {
      ancestorsToExpand.push(currentId);
      currentId = yield* Node.getParent(currentId).pipe(
        Effect.catchTag("NodeHasNoParentError", () =>
          Effect.succeed<Id.Node | null>(null),
        ),
      );
    }

    yield* Effect.forEach(
      ancestorsToExpand,
      (nodeId) => {
        const blockId = Id.makeBlockId(bufferId, nodeId);
        return Store.setDocument("block", { isExpanded: true }, blockId).pipe(
          Effect.orDie,
        );
      },
      { concurrency: 1 },
    );

    if (ancestorsToExpand.length > 0) {
      yield* Effect.logDebug("[Buffer.expandAncestors] Expanded ancestors").pipe(
        Effect.annotateLogs({
          bufferId,
          rootNodeId,
          targetNodeId,
          expandedCount: ancestorsToExpand.length,
          expandedNodes: ancestorsToExpand,
        }),
      );
    }
  });

/**
 * Expands ancestors for multiple target nodes.
 * Deduplicates - if two nodes share an ancestor, it's only expanded once.
 */
export const expandAncestorsForNodes = (
  bufferId: Id.Buffer,
  rootNodeId: Id.Node,
  targetNodeIds: readonly Id.Node[],
): Effect.Effect<void, never, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    // Use Set to deduplicate
    const ancestorsToExpand = new Set<Id.Node>();

    for (const targetNodeId of targetNodeIds) {
      let currentId: Id.Node | null = targetNodeId;

      currentId = yield* Node.getParent(currentId).pipe(
        Effect.catchTag("NodeHasNoParentError", () =>
          Effect.succeed<Id.Node | null>(null),
        ),
      );

      while (currentId !== null && currentId !== rootNodeId) {
        ancestorsToExpand.add(currentId);
        currentId = yield* Node.getParent(currentId).pipe(
          Effect.catchTag("NodeHasNoParentError", () =>
            Effect.succeed<Id.Node | null>(null),
          ),
        );
      }
    }

    yield* Effect.forEach(
      [...ancestorsToExpand],
      (nodeId) => {
        const blockId = Id.makeBlockId(bufferId, nodeId);
        return Store.setDocument("block", { isExpanded: true }, blockId).pipe(
          Effect.orDie,
        );
      },
      { concurrency: 1 },
    );

    if (ancestorsToExpand.size > 0) {
      yield* Effect.logDebug(
        "[Buffer.expandAncestors] Expanded ancestors for nodes",
      ).pipe(
        Effect.annotateLogs({
          bufferId,
          rootNodeId,
          targetCount: targetNodeIds.length,
          expandedCount: ancestorsToExpand.size,
        }),
      );
    }
  });
