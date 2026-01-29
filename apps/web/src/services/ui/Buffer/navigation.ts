import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

export const isBlockExpanded = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
): Effect.Effect<boolean, never, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const blockId = Id.makeBufferBlockId(bufferId, nodeId);
    const blockDoc = yield* Store.getDocument("block", blockId);
    if (Option.isNone(blockDoc)) return true;
    return blockDoc.value.isExpanded;
  });

export const findDeepestLastChild = (
  startNodeId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Id.Node, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

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

    return Option.some(parentId);
  });

export const findNextNodeInDocumentOrder = (
  currentId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<Id.Node>, never, NodeT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    const expanded = yield* isBlockExpanded(bufferId, currentId);
    if (expanded) {
      const children = yield* Node.getNodeChildren(currentId);
      if (children.length > 0) {
        return Option.some(children[0]!);
      }
    }

    return yield* findNextNode(currentId);
  });
