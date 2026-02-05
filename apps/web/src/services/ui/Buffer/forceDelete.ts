import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { findPreviousNode } from "@/services/ui/View/page/navigation";
import { Effect, Option } from "effect";

export interface MergeResult {
  targetNodeId: Id.Node;
  cursorOffset: number;
  isTitle: boolean;
}

/**
 * Force delete a node and all its descendants (Cmd+Shift+Backspace).
 *
 * Unlike mergeBackward, this deletes the node regardless of whether it has children.
 * All descendant text content is also deleted from Automerge.
 *
 * Returns focus target info (previous node, or buffer root if first node).
 */
export const forceDelete = (
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

    // Get buffer root for isTitle check and fallback focus
    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    const rootNodeId = Option.isSome(bufferDoc)
      ? (bufferDoc.value.assignedNodeId as Id.Node | null)
      : null;

    // Collect all descendants BEFORE deletion (they'll be gone from DB after)
    const descendants = yield* Node.getAllDescendants(nodeId);
    const allNodesToDelete = [nodeId, ...descendants];

    // Find focus target before deletion
    const prevNodeOpt = yield* findPreviousNode(nodeId, bufferId);
    const focusNodeId = Option.isSome(prevNodeOpt)
      ? prevNodeOpt.value
      : rootNodeId;

    if (!focusNodeId) return Option.none();

    // Delete the node (materializer cascades to descendants in DB)
    yield* Node.deleteNode(nodeId);

    // Clean up Automerge text for all deleted nodes
    for (const deletedId of allNodesToDelete) {
      yield* Automerge.deleteText(deletedId);
    }

    // Get cursor position at end of focus target
    const targetText = yield* Automerge.getText(focusNodeId);
    const cursorOffset = targetText.length;

    return Option.some({
      targetNodeId: focusNodeId,
      cursorOffset,
      isTitle: focusNodeId === rootNodeId,
    });
  });
