import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { findPreviousNode } from "@/services/ui/Block/navigation";
import { Effect, Option } from "effect";
import { MergeResult } from "./mergeBackward";

/**
 * Force delete a node and all its descendants (Cmd+Shift+Backspace).
 *
 * Unlike mergeBackward, this deletes the node regardless of whether it has children.
 * All descendant text content is also deleted from Yjs.
 *
 * Returns focus target info (previous node, or buffer root if first node).
 */
export const forceDelete = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
): Effect.Effect<Option.Option<MergeResult>, never, NodeT | YjsT | StoreT> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;
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

    // Clean up Yjs text for all deleted nodes
    for (const deletedId of allNodesToDelete) {
      Yjs.deleteText(deletedId);
    }

    // Get cursor position at end of focus target
    const targetYtext = Yjs.getText(focusNodeId);
    const cursorOffset = targetYtext.length;

    return Option.some({
      targetNodeId: focusNodeId,
      cursorOffset,
      isTitle: focusNodeId === rootNodeId,
    });
  });
