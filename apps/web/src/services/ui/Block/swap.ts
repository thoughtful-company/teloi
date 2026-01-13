import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";

/**
 * Swap a node with its sibling in the given direction.
 *
 * - "up": swap with previous sibling
 * - "down": swap with next sibling
 *
 * When at boundary (first/last sibling), attempts cross-parent movement:
 * - "up" at first position: move to last child of parent's previous sibling
 * - "down" at last position: move to first child of parent's next sibling
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
 * Cross-parent movement: move a node to an adjacent parent's children.
 *
 * - "up": move to become last child of parent's previous sibling
 * - "down": move to become first child of parent's next sibling
 *
 * Returns true if move succeeded, false if no valid target exists.
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
      // Find previous parent sibling
      if (parentIndex === 0) return false;
      const prevParentSiblingId = parentSiblings[parentIndex - 1]!;

      // Move to become last child of previous parent sibling
      yield* Node.insertNode({
        nodeId,
        parentId: prevParentSiblingId,
        insert: "after", // "after" with no siblingId = append at end
      });
    } else {
      // Find next parent sibling
      if (parentIndex === parentSiblings.length - 1) return false;
      const nextParentSiblingId = parentSiblings[parentIndex + 1]!;

      // Move to become first child of next parent sibling
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
          insert: "after", // Empty parent - just insert
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
