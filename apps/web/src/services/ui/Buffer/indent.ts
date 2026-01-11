import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";

/**
 * Indent nodes (Tab) - move them to become children of the previous sibling.
 *
 * For multiple nodes, they're moved as a group under the same new parent.
 *
 * Cannot indent:
 * - Nodes with no parent (root nodes)
 * - First siblings (no previous sibling to indent into)
 *
 * Returns Some(newParentId) on success for auto-expand, None on failure.
 */
export const indent = (
  nodeIds: readonly Id.Node[],
): Effect.Effect<Option.Option<Id.Node>, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const firstNode = nodeIds[0];
    if (!firstNode) return Option.none();

    const parentId = yield* Node.getParent(firstNode).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const firstIndex = siblings.indexOf(firstNode);
    if (firstIndex === -1) return Option.none();

    // Can't indent first sibling - no previous sibling to indent into
    if (firstIndex === 0) return Option.none();

    const prevSiblingId = siblings[firstIndex - 1]!;

    // Move all nodes to be children of the previous sibling
    for (const nodeId of nodeIds) {
      yield* Node.insertNode({
        nodeId,
        parentId: prevSiblingId,
        insert: "after",
      });
    }

    return Option.some(prevSiblingId);
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("[Buffer.indent] Operation failed").pipe(
        Effect.annotateLogs({ nodeIds, error: String(error) }),
        Effect.as(Option.none()),
      ),
    ),
  );
