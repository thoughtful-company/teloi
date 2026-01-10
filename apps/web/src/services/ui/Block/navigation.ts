import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";

/**
 * Find the deepest last child of a node (visually previous block).
 * Used for backward navigation - ArrowLeft at start, ArrowUp on first line, Backspace merge.
 */
export const findDeepestLastChild = (
  startNodeId: Id.Node,
): Effect.Effect<Id.Node, never, NodeT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const children = yield* Node.getNodeChildren(startNodeId);
    if (children.length === 0) {
      return startNodeId;
    }
    const lastChild = children[children.length - 1]!;
    return yield* findDeepestLastChild(lastChild);
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
 */
export const findPreviousNode = (
  currentId: Id.Node,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT> =>
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
      const deepest = yield* findDeepestLastChild(prevSiblingId);
      return Option.some(deepest);
    }

    // First child - return parent
    return Option.some(parentId);
  });
