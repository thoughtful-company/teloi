import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";

/**
 * Indent a node (Tab) - move it to become a child of its previous sibling.
 *
 * Cannot indent:
 * - Root nodes (no parent)
 * - First siblings (no previous sibling to indent into)
 *
 * Returns true if indentation succeeded, false otherwise.
 */
export const indent = (nodeId: Id.Node): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);

    // Can't indent first sibling - no previous sibling to indent into
    if (siblingIndex <= 0) return false;

    const prevSiblingId = siblings[siblingIndex - 1]!;

    // Move this node to be a child of the previous sibling
    yield* Node.insertNode({
      nodeId,
      parentId: prevSiblingId,
      insert: "after",
    });

    return true;
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

/**
 * Outdent a node (Shift+Tab) - move it to become a sibling of its parent.
 *
 * Cannot outdent:
 * - Root nodes (no parent)
 * - Nodes whose parent has no parent (would become root)
 *
 * Returns true if outdentation succeeded, false otherwise.
 */
export const outdent = (
  nodeId: Id.Node,
): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return false;

    const grandparentId = yield* Node.getParent(parentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!grandparentId) return false;

    yield* Node.insertNode({
      nodeId,
      parentId: grandparentId,
      insert: "after",
      siblingId: parentId,
    });

    return true;
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));
