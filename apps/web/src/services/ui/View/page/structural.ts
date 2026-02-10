import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { getBlockDoc } from "@/services/ui/Block/getBlockDoc";
import { materialize } from "@/services/ui/Block/materialize";
import { Effect, Option } from "effect";
import { findPreviousNode } from "./navigation";

export interface MergeResult {
  targetNodeId: Id.Node;
  cursorOffset: number;
  isTitle: boolean;
}

/**
 * Get the parent of a block (ghost-aware).
 * For ghosts, returns ghostParentId from block doc.
 * For real nodes, queries Node.getParent.
 */
export const getParent = Effect.fn("View.page.getParent")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
) {
  const Node = yield* NodeT;

  const blockDoc = yield* getBlockDoc(frameId, nodeId);
  if (blockDoc.ghostParentId) {
    return Option.some(blockDoc.ghostParentId);
  }

  const parentId = yield* Node.getParent(nodeId).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );

  return Option.fromNullable(parentId);
});

/**
 * Get children of a block (ghost-aware).
 * Returns real children from Node.getNodeChildren, plus ghostChildId if present.
 */
export const getChildren = Effect.fn("View.page.getChildren")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
) {
  const Node = yield* NodeT;

  const children = yield* Node.getNodeChildren(nodeId);
  const blockDoc = yield* getBlockDoc(frameId, nodeId);

  if (blockDoc.ghostChildId && children.length === 0) {
    return [blockDoc.ghostChildId] as readonly Id.Node[];
  }

  return children;
});

/**
 * Swap a block with its sibling (ghost-aware).
 * Materializes ghost first, then performs swap.
 */
export const swap = Effect.fn("View.page.swap")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
  direction: "up" | "down",
) {
  const Node = yield* NodeT;

  // Materialize if ghost
  const blockDoc = yield* getBlockDoc(frameId, nodeId);
  if (blockDoc.ghostParentId) {
    yield* materialize({
      ghostNodeId: nodeId,
      parentNodeId: blockDoc.ghostParentId,
      frameId,
    });
  }

  // Now proceed with normal swap logic
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
});

/**
 * Move a block to first sibling position (ghost-aware).
 * Materializes ghost first, then performs move.
 */
export const moveToFirst = Effect.fn("View.page.moveToFirst")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
) {
  const Node = yield* NodeT;

  // Materialize if ghost
  const blockDoc = yield* getBlockDoc(frameId, nodeId);
  if (blockDoc.ghostParentId) {
    yield* materialize({
      ghostNodeId: nodeId,
      parentNodeId: blockDoc.ghostParentId,
      frameId,
    });
  }

  const parentId = yield* Node.getParent(nodeId).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );
  if (!parentId) return false;

  const siblings = yield* Node.getNodeChildren(parentId);
  const siblingIndex = siblings.indexOf(nodeId);
  if (siblingIndex === -1 || siblingIndex === 0) return false;

  const firstSiblingId = siblings[0]!;
  yield* Node.insertNode({
    nodeId,
    parentId,
    insert: "before",
    siblingId: firstSiblingId,
  });

  return true;
});

/**
 * Move a block to last sibling position (ghost-aware).
 * Materializes ghost first, then performs move.
 */
export const moveToLast = Effect.fn("View.page.moveToLast")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
) {
  const Node = yield* NodeT;

  // Materialize if ghost
  const blockDoc = yield* getBlockDoc(frameId, nodeId);
  if (blockDoc.ghostParentId) {
    yield* materialize({
      ghostNodeId: nodeId,
      parentNodeId: blockDoc.ghostParentId,
      frameId,
    });
  }

  const parentId = yield* Node.getParent(nodeId).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );
  if (!parentId) return false;

  const siblings = yield* Node.getNodeChildren(parentId);
  const siblingIndex = siblings.indexOf(nodeId);
  if (siblingIndex === -1 || siblingIndex === siblings.length - 1) return false;

  const lastSiblingId = siblings[siblings.length - 1]!;
  yield* Node.insertNode({
    nodeId,
    parentId,
    insert: "after",
    siblingId: lastSiblingId,
  });

  return true;
});

/**
 * Force delete a block and all descendants (ghost-aware).
 *
 * For ghosts: just clean up block docs + Automerge text (no LiveStore node).
 * For real nodes: delete from LiveStore, clean up Automerge text.
 *
 * Returns focus target info (previous node, or frame root if first node).
 */
export const forceDelete = Effect.fn("View.page.forceDelete")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
) {
  const Node = yield* NodeT;
  const Automerge = yield* AutomergeT;
  const Store = yield* StoreT;

  const blockDoc = yield* getBlockDoc(frameId, nodeId);
  const frameDoc = yield* Store.getDocument("frame", frameId);
  const rootNodeId = Option.isSome(frameDoc)
    ? (frameDoc.value.assignedNodeId as Id.Node | null)
    : null;

  // Find focus target before deletion
  const prevNodeOpt = yield* findPreviousNode(nodeId, frameId);
  const focusNodeId = Option.isSome(prevNodeOpt)
    ? prevNodeOpt.value
    : rootNodeId;

  if (!focusNodeId) return Option.none<MergeResult>();

  if (blockDoc.ghostParentId) {
    // Ghost deletion: clean up block docs + Automerge, no LiveStore node to delete
    yield* Automerge.deleteText(nodeId);

    // Clear ghostChildId on parent
    const parentBlockId = Id.makeFrameBlockId(frameId, blockDoc.ghostParentId);
    const parentDoc = yield* Store.getDocument("block", parentBlockId);
    if (Option.isSome(parentDoc)) {
      yield* Store.setDocument(
        "block",
        { ...parentDoc.value, ghostChildId: null },
        parentBlockId,
      ).pipe(Effect.catchAll(() => Effect.void));
    }

    // Clear own block doc
    const ghostBlockId = Id.makeFrameBlockId(frameId, nodeId);
    yield* Store.setDocument(
      "block",
      {
        isExpanded: false,
        activeViewId: null,
        ghostChildId: null,
        ghostParentId: null,
        selection: null,
      },
      ghostBlockId,
    ).pipe(Effect.catchAll(() => Effect.void));
  } else {
    // Real node deletion
    const descendants = yield* Node.getAllDescendants(nodeId);
    const allNodesToDelete = [nodeId, ...descendants];

    yield* Node.deleteNode(nodeId);

    for (const deletedId of allNodesToDelete) {
      yield* Automerge.deleteText(deletedId);
    }
  }

  const targetText = yield* Automerge.getText(focusNodeId);
  const cursorOffset = targetText.length;

  return Option.some({
    targetNodeId: focusNodeId,
    cursorOffset,
    isTitle: focusNodeId === rootNodeId,
  });
});

// ================================ Internal ==================================

/**
 * Cross-parent movement for swap at boundary.
 */
const crossParentMove = Effect.fn("View.page.crossParentMove")(function* (
  nodeId: Id.Node,
  parentId: Id.Node,
  direction: "up" | "down",
) {
  const Node = yield* NodeT;

  const grandparentId = yield* Node.getParent(parentId).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );
  if (!grandparentId) return false;

  const parentSiblings = yield* Node.getNodeChildren(grandparentId);
  const parentIndex = parentSiblings.indexOf(parentId);
  if (parentIndex === -1) return false;

  if (direction === "up") {
    if (parentIndex > 0) {
      const prevParentSiblingId = parentSiblings[parentIndex - 1]!;
      yield* Node.insertNode({
        nodeId,
        parentId: prevParentSiblingId,
        insert: "after",
      });
    } else {
      yield* Node.insertNode({
        nodeId,
        parentId: grandparentId,
        insert: "before",
        siblingId: parentId,
      });
    }
  } else {
    if (parentIndex < parentSiblings.length - 1) {
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
      yield* Node.insertNode({
        nodeId,
        parentId: grandparentId,
        insert: "after",
        siblingId: parentId,
      });
    }
  }

  return true;
});
