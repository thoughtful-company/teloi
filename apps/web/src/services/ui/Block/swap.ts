import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";

/**
 * Swap a node with its sibling in the given direction.
 *
 * - "up": swap with previous sibling
 * - "down": swap with next sibling
 *
 * When at boundary (first/last sibling), cross-parent or outdent:
 * - "up" at first: if parent has prev sibling → become last child of that sibling
 *                  else → outdent (become sibling BEFORE parent)
 * - "down" at last: if parent has next sibling → become first child of that sibling
 *                   else → outdent (become sibling AFTER parent)
 *
 * Returns true if swap succeeded, false otherwise.
 */
export const swap = (
  nodeId: Id.Node,
  direction: "up" | "down",
): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);
    if (siblingIndex === -1) return false;

    if (direction === "up") {
      if (siblingIndex === 0) {
        // At first position - try cross-parent movement
        return yield* crossParentMove(nodeId, parentId, "up");
      }
      const prevSiblingId = siblings[siblingIndex - 1]!;
      yield* Node.insertNode({
        nodeId,
        parentId,
        insert: "before",
        siblingId: prevSiblingId,
      });
    } else {
      if (siblingIndex === siblings.length - 1) {
        // At last position - try cross-parent movement
        return yield* crossParentMove(nodeId, parentId, "down");
      }
      const nextSiblingId = siblings[siblingIndex + 1]!;
      yield* Node.insertNode({
        nodeId,
        parentId,
        insert: "after",
        siblingId: nextSiblingId,
      });
    }

    return true;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("[Block.swap] Operation failed").pipe(
        Effect.annotateLogs({ nodeId, direction, error: String(error) }),
        Effect.as(false),
      ),
    ),
  );

/**
 * Cross-parent movement: prioritize moving to parent's sibling, fallback to outdent.
 *
 * - "up": if parent has prev sibling → become last child of that sibling
 *         else → outdent (become sibling BEFORE parent)
 * - "down": if parent has next sibling → become first child of that sibling
 *           else → outdent (become sibling AFTER parent)
 *
 * Returns true if move succeeded, false if at buffer root.
 */
const crossParentMove = (
  nodeId: Id.Node,
  parentId: Id.Node,
  direction: "up" | "down",
): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    // Get grandparent (parent's parent)
    const grandparentId = yield* Node.getParent(parentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!grandparentId) return false;

    // Get parent's siblings
    const parentSiblings = yield* Node.getNodeChildren(grandparentId);
    const parentIndex = parentSiblings.indexOf(parentId);
    if (parentIndex === -1) return false;

    if (direction === "up") {
      if (parentIndex > 0) {
        // Parent HAS prev sibling → cross-parent move (become last child)
        const prevParentSiblingId = parentSiblings[parentIndex - 1]!;
        yield* Node.insertNode({
          nodeId,
          parentId: prevParentSiblingId,
          insert: "after", // append at end
        });
      } else {
        // Parent has NO prev sibling → outdent (become sibling BEFORE parent)
        yield* Node.insertNode({
          nodeId,
          parentId: grandparentId,
          insert: "before",
          siblingId: parentId,
        });
      }
    } else {
      if (parentIndex < parentSiblings.length - 1) {
        // Parent HAS next sibling → cross-parent move (become first child)
        const nextParentSiblingId = parentSiblings[parentIndex + 1]!;
        const targetChildren = yield* Node.getNodeChildren(nextParentSiblingId);
        if (targetChildren.length > 0) {
          yield* Node.insertNode({
            nodeId,
            parentId: nextParentSiblingId,
            insert: "before",
            siblingId: targetChildren[0]!,
          });
        } else {
          yield* Node.insertNode({
            nodeId,
            parentId: nextParentSiblingId,
            insert: "after",
          });
        }
      } else {
        // Parent has NO next sibling → outdent (become sibling AFTER parent)
        yield* Node.insertNode({
          nodeId,
          parentId: grandparentId,
          insert: "after",
          siblingId: parentId,
        });
      }
    }

    return true;
  }).pipe(
    Effect.catchAll(() => Effect.succeed(false)),
  );

/**
 * Move a node to be the first sibling.
 * Returns true if move succeeded, false otherwise.
 */
export const moveToFirst = (
  nodeId: Id.Node,
): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);
    if (siblingIndex === -1) return false;

    // Already first
    if (siblingIndex === 0) return false;

    const firstSiblingId = siblings[0]!;
    yield* Node.insertNode({
      nodeId,
      parentId,
      insert: "before",
      siblingId: firstSiblingId,
    });

    return true;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("[Block.moveToFirst] Operation failed").pipe(
        Effect.annotateLogs({ nodeId, error: String(error) }),
        Effect.as(false),
      ),
    ),
  );

/**
 * Move a node to be the last sibling.
 * Returns true if move succeeded, false otherwise.
 */
export const moveToLast = (
  nodeId: Id.Node,
): Effect.Effect<boolean, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);
    if (siblingIndex === -1) return false;

    // Already last
    if (siblingIndex === siblings.length - 1) return false;

    const lastSiblingId = siblings[siblings.length - 1]!;
    yield* Node.insertNode({
      nodeId,
      parentId,
      insert: "after",
      siblingId: lastSiblingId,
    });

    return true;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("[Block.moveToLast] Operation failed").pipe(
        Effect.annotateLogs({ nodeId, error: String(error) }),
        Effect.as(false),
      ),
    ),
  );
