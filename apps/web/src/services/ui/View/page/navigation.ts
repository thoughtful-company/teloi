import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { getKhoraDoc } from "@/services/ui/Khora/getKhoraDoc";
import { Effect, Option } from "effect";

type NavResult = Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT>;

/**
 * Find the previous node in document order (page view).
 * Handles ghost blocks via ghostParentId fallback.
 */
export const findPreviousNode = Effect.fn("View.page.findPreviousNode")(
  function* (nodeId: Id.Node, frameId: Id.Frame) {
    const Node = yield* NodeT;
    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    // Ghost blocks have no parent_links — resolve via ghostParentId
    if (!parentId) {
      const block = yield* getKhoraDoc(frameId, nodeId);
      if (block.ghostParentId) {
        return Option.some(block.ghostParentId);
      }
      return Option.none();
    }

    const siblings = yield* Node.getNodeChildren(parentId);
    const idx = siblings.indexOf(nodeId);
    if (idx === -1) return Option.none();

    if (idx > 0) {
      const prevSiblingId = siblings[idx - 1]!;
      const deepest = yield* findDeepestLastChild(prevSiblingId, frameId);
      return Option.some(deepest);
    }

    return Option.some(parentId);
  },
);

/**
 * Find the next node in document order (page view).
 * If current block is expanded with children, returns first child.
 * Otherwise finds next sibling or ancestor's next sibling.
 */
export const findNextNodeInDocumentOrder = Effect.fn(
  "View.page.findNextNodeInDocumentOrder",
)(function* (nodeId: Id.Node, frameId: Id.Frame) {
  const Node = yield* NodeT;

  const block = yield* getKhoraDoc(frameId, nodeId);
  if (block.isExpanded) {
    const children = yield* Node.getNodeChildren(nodeId);
    if (children.length > 0) {
      return Option.some(children[0]!);
    }
    if (block.ghostChildId) {
      return Option.some(block.ghostChildId);
    }
  }

  return yield* findNextNode(nodeId, frameId);
});

/**
 * Find next sibling or ancestor's next sibling.
 * Handles ghost blocks via ghostParentId fallback.
 */
export const findNextNode = (
  currentId: Id.Node,
  frameId: Id.Frame,
): NavResult =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    let parentId = yield* Node.getParent(currentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    // Ghost blocks have no parent_links — resolve via ghostParentId
    if (!parentId) {
      const block = yield* getKhoraDoc(frameId, currentId);
      if (block.ghostParentId) {
        parentId = block.ghostParentId;
      }
    }

    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const idx = siblings.indexOf(currentId);

    // Ghost blocks aren't in siblings list. Treat as last child — recurse to parent.
    if (idx === -1) {
      return yield* findNextNode(parentId, frameId);
    }

    if (idx < siblings.length - 1) {
      return Option.some(siblings[idx + 1]!);
    }

    return yield* findNextNode(parentId, frameId);
  });

/**
 * Find the deepest last child of a node (for navigation).
 */
export const findDeepestLastChild = Effect.fn("View.page.findDeepestLastChild")(
  function* (startNodeId: Id.Node, frameId: Id.Frame) {
    const Node = yield* NodeT;

    let current = startNodeId;
    while (true) {
      const block = yield* getKhoraDoc(frameId, current);
      if (!block.isExpanded) return current;

      const children = yield* Node.getNodeChildren(current);

      // If there's a ghost child, it's the "last" visible child
      if (children.length === 0) {
        if (block.ghostChildId) {
          return block.ghostChildId;
        }
        return current;
      }

      current = children[children.length - 1]!;
    }
  },
);
