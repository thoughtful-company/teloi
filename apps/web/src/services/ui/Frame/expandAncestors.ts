import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { getKhoraDocById } from "@/services/ui/Khora/getKhoraDoc";
import { Effect } from "effect";
import { StoreT } from "../../external/Store";

/**
 * Expands all ancestor blocks between rootNodeId and targetNodeId.
 *
 * - rootNodeId is EXCLUDED (it's the frame root, has no parent block to expand)
 * - targetNodeId is EXCLUDED (we expand ancestors, not the target itself)
 *
 * @param frameId - The frame ID (needed to construct block IDs)
 * @param rootNodeId - The frame's assignedKhoraId (stop here, don't expand)
 * @param targetNodeId - The node being selected (start traversal here)
 */
export const expandAncestors = (
  frameId: Id.Frame,
  rootNodeId: Id.Node,
  targetNodeId: Id.Node,
): Effect.Effect<void, never, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    const ancestorsToExpand: Id.Node[] = [];
    let currentId: Id.Node | null = targetNodeId;

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
      (nodeId) =>
        setExpandedKhoraDoc(Store, Id.makeFrameKhoraId(frameId, nodeId)),
      { concurrency: 1 },
    );

    if (ancestorsToExpand.length > 0) {
      yield* Effect.logDebug("[Frame.expandAncestors] Expanded ancestors").pipe(
        Effect.annotateLogs({
          frameId,
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
  frameId: Id.Frame,
  rootNodeId: Id.Node,
  targetNodeIds: readonly Id.Node[],
): Effect.Effect<void, never, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

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
      (nodeId) =>
        setExpandedKhoraDoc(Store, Id.makeFrameKhoraId(frameId, nodeId)),
      { concurrency: 1 },
    );

    if (ancestorsToExpand.size > 0) {
      yield* Effect.logDebug(
        "[Frame.expandAncestors] Expanded ancestors for nodes",
      ).pipe(
        Effect.annotateLogs({
          frameId,
          rootNodeId,
          targetCount: targetNodeIds.length,
          expandedCount: ancestorsToExpand.size,
        }),
      );
    }
  });

// ================================ Internal ==================================

const setExpandedKhoraDoc = (Store: StoreT["Type"], khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const khoraDoc = yield* getKhoraDocById(khoraId);

    yield* Store.setDocument(
      "khora",
      { ...khoraDoc, isExpanded: true },
      khoraId,
    ).pipe(Effect.orDie);
  });
