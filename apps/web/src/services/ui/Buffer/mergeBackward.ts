import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { findDeepestLastChild } from "@/services/ui/Block/navigation";
import { Effect, Option } from "effect";

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
  bufferId: Id.Buffer,
  nodeId: Id.Node,
): Effect.Effect<
  Option.Option<MergeResult>,
  never,
  NodeT | AutomergeT | StoreT
> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;
    const Store = yield* StoreT;

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

    // Get buffer's assignedNodeId for title detection
    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    const rootNodeId = Option.isSome(bufferDoc)
      ? bufferDoc.value.assignedNodeId
      : null;

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);
    const currentText = yield* Automerge.getText(nodeId);

    // First sibling: merge into parent
    if (siblingIndex === 0) {
      const parentText = yield* Automerge.getText(parentId);
      const mergePoint = parentText.length;

      yield* Automerge.setText(parentId, parentText + currentText);
      yield* Node.deleteNode(nodeId);
      yield* Automerge.deleteText(nodeId);

      return Option.some({
        targetNodeId: parentId,
        cursorOffset: mergePoint,
        isTitle: parentId === rootNodeId,
      });
    }

    // Merge into previous sibling's deepest last child (respects collapsed state)
    const prevSiblingId = siblings[siblingIndex - 1]!;
    const targetNodeId = yield* findDeepestLastChild(prevSiblingId, bufferId);
    const targetText = yield* Automerge.getText(targetNodeId);
    const mergePoint = targetText.length;

    yield* Automerge.setText(targetNodeId, targetText + currentText);
    yield* Node.deleteNode(nodeId);
    yield* Automerge.deleteText(nodeId);

    return Option.some({
      targetNodeId,
      cursorOffset: mergePoint,
      isTitle: false,
    });
  });
