import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { getKhoraDoc } from "@/services/ui/Khora/getKhoraDoc";
import { materialize } from "@/services/ui/Khora/materialize";
import { Effect, Option } from "effect";

/**
 * Page view createKhora: creates a new node in the tree structure.
 *
 * - Title context (nodeId === frame's assignedKhoraId): inserts as first child
 * - Block context: inserts as sibling with the given position
 * - Ghost context: materializes the ghost first, then inserts as sibling
 */
export const createKhora = Effect.fn("View.page.createKhora")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
  position: "before" | "after",
) {
  const Node = yield* NodeT;
  const Store = yield* StoreT;

  const frameDoc = yield* Store.getDocument("frame", frameId);
  const assignedKhoraId = Option.isSome(frameDoc)
    ? (frameDoc.value.assignedKhoraId as Id.Node | null)
    : null;

  const isTitle = nodeId === assignedKhoraId;

  if (isTitle) {
    return yield* Node.insertNode({ parentId: nodeId, insert: "before" });
  }

  // Check if this is a ghost block — materialize first
  const blockDoc = yield* getKhoraDoc(frameId, nodeId);
  if (blockDoc.ghostParentId) {
    yield* materialize({
      ghostNodeId: nodeId,
      parentNodeId: blockDoc.ghostParentId,
      frameId,
    });
  }

  const parentId = yield* Node.getParent(nodeId);
  return yield* Node.insertNode({
    parentId,
    insert: position,
    siblingId: nodeId,
  });
});
