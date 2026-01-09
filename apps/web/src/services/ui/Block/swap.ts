import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";

/**
 * Swap a node with its sibling in the given direction.
 *
 * - "up": swap with previous sibling
 * - "down": swap with next sibling
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
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);

    if (direction === "up") {
      if (siblingIndex <= 0) return false;
      const prevSiblingId = siblings[siblingIndex - 1]!;
      yield* Node.insertNode({
        nodeId,
        parentId,
        insert: "before",
        siblingId: prevSiblingId,
      });
    } else {
      if (siblingIndex >= siblings.length - 1) return false;
      const nextSiblingId = siblings[siblingIndex + 1]!;
      yield* Node.insertNode({
        nodeId,
        parentId,
        insert: "after",
        siblingId: nextSiblingId,
      });
    }

    return true;
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

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
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);

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
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));

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
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return false;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);

    // Already last
    if (siblingIndex >= siblings.length - 1) return false;

    const lastSiblingId = siblings[siblings.length - 1]!;
    yield* Node.insertNode({
      nodeId,
      parentId,
      insert: "after",
      siblingId: lastSiblingId,
    });

    return true;
  }).pipe(Effect.catchAll(() => Effect.succeed(false)));
