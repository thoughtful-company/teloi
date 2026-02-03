import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

/**
 * Page view createBlock: creates a new node in the tree structure.
 *
 * - Title context (nodeId === buffer's assignedNodeId): inserts as first child
 * - Block context: inserts as sibling with the given position
 */
export const createBlock = (
  nodeId: Id.Node,
  bufferId: Id.Buffer,
  position: "before" | "after",
) =>
  Effect.gen(function* () {
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

    const parentId = yield* Node.getParent(nodeId);
    return yield* Node.insertNode({
      parentId,
      insert: position,
      siblingId: nodeId,
    });
  }).pipe(Effect.orDie);
