import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { getBlockDoc } from "@/services/ui/Block/getBlockDoc";
import { materialize } from "@/services/ui/Block/materialize";
import { Effect, Option } from "effect";

/**
 * Page view createBlock: creates a new node in the tree structure.
 *
 * - Title context (nodeId === buffer's assignedNodeId): inserts as first child
 * - Block context: inserts as sibling with the given position
 * - Ghost context: materializes the ghost first, then inserts as sibling
 */
export const createBlock = Effect.fn("View.page.createBlock")(function* (
  nodeId: Id.Node,
  bufferId: Id.Buffer,
  position: "before" | "after",
) {
  const Node = yield* NodeT;
  const Store = yield* StoreT;

  const bufferDoc = yield* Store.getDocument("buffer", bufferId);
  const assignedNodeId = Option.isSome(bufferDoc)
    ? (bufferDoc.value.assignedNodeId as Id.Node | null)
    : null;

  const isTitle = nodeId === assignedNodeId;

  if (isTitle) {
    return yield* Node.insertNode({ parentId: nodeId, insert: "before" });
  }

  // Check if this is a ghost block — materialize first
  const blockDoc = yield* getBlockDoc(bufferId, nodeId);
  if (blockDoc.ghostParentId) {
    yield* materialize({
      ghostNodeId: nodeId,
      parentNodeId: blockDoc.ghostParentId,
      bufferId,
    });
  }

  const parentId = yield* Node.getParent(nodeId);
  return yield* Node.insertNode({
    parentId,
    insert: position,
    siblingId: nodeId,
  });
});
