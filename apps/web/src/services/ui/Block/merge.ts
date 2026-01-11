import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option } from "effect";
import { findDeepestLastChild, findNextNode } from "./navigation";

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
 */
export const mergeBackward = (
  nodeId: Id.Node,
  rootNodeId: Id.Node | null,
): Effect.Effect<Option.Option<MergeResult>, never, NodeT | YjsT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

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

    // Merge into previous sibling's deepest last child
    const prevSiblingId = siblings[siblingIndex - 1]!;
    const targetNodeId = yield* findDeepestLastChild(prevSiblingId);
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
 * - Has children: merge first child into current
 * - No children: find next node in document order and merge it in
 *
 * Deletes the source node and appends its text to the current node.
 * Returns cursor position (at merge point) - target is always the current node.
 */
export const mergeForward = (
  nodeId: Id.Node,
): Effect.Effect<
  Option.Option<{ cursorOffset: number }>,
  never,
  NodeT | YjsT
> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const currentYtext = Yjs.getText(nodeId);
    const mergePoint = currentYtext.length;

    const children = yield* Node.getNodeChildren(nodeId);

    // If has children, merge first child into current
    if (children.length > 0) {
      const firstChildId = children[0]!;
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

    // Find next node in document order
    const nextNodeOpt = yield* findNextNode(nodeId);
    if (Option.isNone(nextNodeOpt)) return Option.none();

    const nextNodeId = nextNodeOpt.value;
    const nextYtext = Yjs.getText(nextNodeId);

    // Get formatted deltas before modification
    const nextDeltas = yield* Yjs.getDeltasWithFormats(
      nextNodeId,
      0,
      nextYtext.length,
    );

    // Insert with formatting preservation
    yield* Yjs.insertWithFormats(nodeId, mergePoint, nextDeltas);
    yield* Node.deleteNode(nextNodeId);
    Yjs.deleteText(nextNodeId);

    return Option.some({ cursorOffset: mergePoint });
  });
