import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option } from "effect";
import { findDeepestLastChild, isBlockExpanded } from "./navigation";

export interface MergeResult {
  targetNodeId: Id.Node;
  cursorOffset: number;
  isTitle: boolean;
}

/**
 * Merge current node backward (what happens on Backspace at start).
 *
 * - First sibling: merge into parent
 * - Otherwise: find deepest last child of previous sibling and merge there
 *
 * Deletes the source node and appends its text to the target.
 * Returns the target node ID and cursor position (at merge point).
 * Respects collapsed state - won't merge into hidden children.
 *
 * Key constraint: Can't merge a node that has children (would orphan them).
 */
export const mergeBackward = (
  nodeId: Id.Node,
  rootNodeId: Id.Node | null,
  bufferId: Id.Buffer,
): Effect.Effect<Option.Option<MergeResult>, never, NodeT | YjsT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    // Can't delete a node that has children (would orphan them)
    const nodeChildren = yield* Node.getNodeChildren(nodeId);
    if (nodeChildren.length > 0) {
      return Option.none();
    }

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);
    const currentYtext = Yjs.getText(nodeId);

    // Get formatted deltas for current node's text BEFORE any modifications
    const currentDeltas = yield* Yjs.getDeltasWithFormats(
      nodeId,
      0,
      currentYtext.length,
    );

    // First sibling: merge into parent
    if (siblingIndex === 0) {
      const parentYtext = Yjs.getText(parentId);
      const mergePoint = parentYtext.length;

      // Insert with formatting preservation
      yield* Yjs.insertWithFormats(parentId, mergePoint, currentDeltas);
      yield* Node.deleteNode(nodeId);
      Yjs.deleteText(nodeId);

      return Option.some({
        targetNodeId: parentId,
        cursorOffset: mergePoint,
        isTitle: parentId === rootNodeId,
      });
    }

    // Merge into previous sibling's deepest last child (respects collapsed state)
    const prevSiblingId = siblings[siblingIndex - 1]!;
    const targetNodeId = yield* findDeepestLastChild(prevSiblingId, bufferId);
    const targetYtext = Yjs.getText(targetNodeId);
    const mergePoint = targetYtext.length;

    // Insert with formatting preservation
    yield* Yjs.insertWithFormats(targetNodeId, mergePoint, currentDeltas);
    yield* Node.deleteNode(nodeId);
    Yjs.deleteText(nodeId);

    return Option.some({
      targetNodeId,
      cursorOffset: mergePoint,
      isTitle: false,
    });
  });

/**
 * Merge forward (what happens on Delete at end).
 *
 * Decision tree:
 * - Has VISIBLE children (expanded AND has children)?
 *   - YES: First child has no children? → merge first child
 *   - NO: no-op (would orphan grandchildren)
 * - No visible children (collapsed OR no children)?
 *   - Has next sibling?
 *     - YES: Next sibling has no children? → merge next sibling
 *     - NO: no-op (would orphan nieces/nephews)
 *   - No next sibling: no-op (don't cross hierarchy)
 *
 * Key constraint: Never merge a block that has children (would orphan them).
 */
export const mergeForward = (
  nodeId: Id.Node,
  bufferId: Id.Buffer,
): Effect.Effect<
  Option.Option<{ cursorOffset: number }>,
  never,
  NodeT | YjsT | StoreT
> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const currentYtext = Yjs.getText(nodeId);
    const mergePoint = currentYtext.length;

    const children = yield* Node.getNodeChildren(nodeId);
    const isExpanded = yield* isBlockExpanded(bufferId, nodeId);

    // Path 1: Has VISIBLE children (expanded AND has children)
    if (children.length > 0 && isExpanded) {
      const firstChildId = children[0]!;
      const firstChildChildren = yield* Node.getNodeChildren(firstChildId);

      // Can only merge if first child has no children (would orphan them)
      if (firstChildChildren.length > 0) {
        return Option.none();
      }

      const childYtext = Yjs.getText(firstChildId);

      // Get formatted deltas before modification
      const childDeltas = yield* Yjs.getDeltasWithFormats(
        firstChildId,
        0,
        childYtext.length,
      );

      // Insert with formatting preservation
      yield* Yjs.insertWithFormats(nodeId, mergePoint, childDeltas);
      yield* Node.deleteNode(firstChildId);
      Yjs.deleteText(firstChildId);

      return Option.some({ cursorOffset: mergePoint });
    }

    // Path 2: No visible children (collapsed OR no children)
    // Only look at next SIBLING, not next node in doc order (don't cross hierarchy)
    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);

    // No next sibling (last child of parent) → no-op
    if (siblingIndex === -1 || siblingIndex === siblings.length - 1) {
      return Option.none();
    }

    const nextSiblingId = siblings[siblingIndex + 1]!;
    const nextSiblingChildren = yield* Node.getNodeChildren(nextSiblingId);

    // Next sibling has children → no-op (would orphan them)
    if (nextSiblingChildren.length > 0) {
      return Option.none();
    }

    const nextYtext = Yjs.getText(nextSiblingId);

    // Get formatted deltas before modification
    const nextDeltas = yield* Yjs.getDeltasWithFormats(
      nextSiblingId,
      0,
      nextYtext.length,
    );

    // Insert with formatting preservation
    yield* Yjs.insertWithFormats(nodeId, mergePoint, nextDeltas);
    yield* Node.deleteNode(nextSiblingId);
    Yjs.deleteText(nextSiblingId);

    return Option.some({ cursorOffset: mergePoint });
  });
