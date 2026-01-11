import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

/**
 * Outdent nodes (Shift+Tab) - move them to become siblings of their parent.
 *
 * For multiple nodes, they're moved in reverse order to maintain relative ordering.
 *
 * Cannot outdent:
 * - Root nodes (no parent)
 * - Nodes whose parent has no parent (would become root)
 * - First-level blocks in buffer (parent is buffer's assignedNodeId)
 *
 * Returns true if outdentation succeeded, false otherwise.
 */
export const outdent = (
  bufferId: Id.Buffer,
  nodeIds: readonly Id.Node[],
): Effect.Effect<boolean, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Store = yield* StoreT;

    const firstNode = nodeIds[0];
    if (!firstNode) return false;

    const parentId = yield* Node.getParent(firstNode).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return false;

    // Get buffer's assignedNodeId to check boundary
    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    const assignedNodeId = Option.isSome(bufferDoc)
      ? bufferDoc.value.assignedNodeId
      : null;

    // BUG FIX: Can't outdent first-level blocks (parent is buffer root)
    if (assignedNodeId && parentId === assignedNodeId) return false;

    const grandparentId = yield* Node.getParent(parentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!grandparentId) return false;

    // Move all nodes in reverse order to maintain relative ordering
    for (let i = nodeIds.length - 1; i >= 0; i--) {
      yield* Node.insertNode({
        nodeId: nodeIds[i]!,
        parentId: grandparentId,
        insert: "after",
        siblingId: parentId,
      });
    }

    return true;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("[Buffer.outdent] Operation failed").pipe(
        Effect.annotateLogs({ bufferId, nodeIds, error: String(error) }),
        Effect.as(false),
      ),
    ),
  );
