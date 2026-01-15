import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

/**
 * Check if a block is expanded (showing children).
 * Returns true if expanded or if block document doesn't exist yet.
 */
export const isBlockExpanded = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
): Effect.Effect<boolean, never, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockId = Id.makeBlockId(bufferId, nodeId);
    const blockDoc = yield* Store.getDocument("block", blockId);
    if (Option.isNone(blockDoc)) return true; // Default to expanded if no doc
    return blockDoc.value.isExpanded;
  });

/**
 * Find the deepest last child of a node (visually previous block).
 * Used for backward navigation - ArrowLeft at start, ArrowUp on first line, Backspace merge.
 * Respects collapsed state - won't descend into collapsed nodes.
 */
export const findDeepestLastChild = (
  startNodeId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Id.Node, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    // Check if this node is expanded before descending
    const expanded = yield* isBlockExpanded(bufferId, startNodeId);
    if (!expanded) {
      return startNodeId;
    }

    const children = yield* Node.getNodeChildren(startNodeId);
    if (children.length === 0) {
      return startNodeId;
    }
    const lastChild = children[children.length - 1]!;
    return yield* findDeepestLastChild(lastChild, bufferId);
  });

/**
 * Find next node in document order (next sibling, or parent's next sibling, etc.)
 * Used for forward navigation - ArrowRight at end, ArrowDown on last line, Delete merge.
 */
export const findNextNode = (
  currentId: Id.Node,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const parentId = yield* Node.getParent(currentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );

    yield* Effect.logDebug("[Block.findNextNode] Looking for next").pipe(
      Effect.annotateLogs({
        currentId,
        parentId,
      }),
    );

    if (!parentId) {
      yield* Effect.logDebug("[Block.findNextNode] No parent, returning none");
      return Option.none();
    }

    const siblings = yield* Node.getNodeChildren(parentId);
    const idx = siblings.indexOf(currentId);

    yield* Effect.logDebug("[Block.findNextNode] Sibling analysis").pipe(
      Effect.annotateLogs({
        siblingCount: siblings.length,
        currentIndex: idx,
        siblings: siblings.join(", "),
      }),
    );

    if (idx === -1) {
      yield* Effect.logDebug("[Block.findNextNode] Not found in siblings");
      return Option.none();
    }

    if (idx < siblings.length - 1) {
      const nextSibling = siblings[idx + 1]!;
      yield* Effect.logDebug("[Block.findNextNode] Found next sibling").pipe(
        Effect.annotateLogs({ nextSibling }),
      );
      return Option.some(nextSibling);
    }

    yield* Effect.logDebug(
      "[Block.findNextNode] Last sibling, recursing to parent",
    );
    return yield* findNextNode(parentId);
  });

/**
 * Find previous node in document order (previous sibling's deepest child, or parent).
 * Used for backward navigation.
 * Respects collapsed state - won't descend into collapsed nodes.
 */
export const findPreviousNode = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const parentId = yield* Node.getParent(currentId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed<Id.Node | null>(null),
      ),
    );
    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const idx = siblings.indexOf(currentId);
    if (idx === -1) return Option.none();

    if (idx > 0) {
      const prevSiblingId = siblings[idx - 1]!;
      const deepest = yield* findDeepestLastChild(prevSiblingId, bufferId);
      return Option.some(deepest);
    }

    // First child - return parent
    return Option.some(parentId);
  });

/**
 * Find next node in VISUAL document order for block selection.
 * Unlike findNextNode, this DOES descend into expanded children first.
 *
 * Order: current -> first child (if expanded) -> next sibling -> parent's next sibling
 */
export const findNextNodeInDocumentOrder = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    // First: if has visible children (expanded), go to first child
    const expanded = yield* isBlockExpanded(bufferId, currentId);
    if (expanded) {
      const children = yield* Node.getNodeChildren(currentId);
      if (children.length > 0) {
        return Option.some(children[0]!);
      }
    }

    // Otherwise: find next sibling or ancestor's next sibling
    return yield* findNextNode(currentId);
  });
