import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

export interface MaterializeParams {
  readonly ghostNodeId: Id.Node;
  readonly parentNodeId: Id.Node;
  readonly frameId: Id.Frame;
}

/**
 * Convert a ghost block into a real LiveStore node.
 *
 * 1. Creates the node in LiveStore (parent_links)
 * 2. Clears ghostChildId on the parent's block doc
 * 3. Clears ghostParentId on the ghost's block doc
 *
 * Automerge text is already bound to ghostNodeId — the real Block
 * component picks it up seamlessly.
 */
export const materialize = Effect.fn("Block.materialize")(function* (
  params: MaterializeParams,
) {
  const Node = yield* NodeT;
  const Store = yield* StoreT;

  yield* Node.insertNode({
    nodeId: params.ghostNodeId,
    parentId: params.parentNodeId,
    insert: "after",
  }).pipe(Effect.catchAll(() => Effect.void));

  const parentBlockId = Id.makeFrameBlockId(
    params.frameId,
    params.parentNodeId,
  );
  const parentDoc = yield* Store.getDocument("block", parentBlockId);
  if (Option.isSome(parentDoc)) {
    yield* Store.setDocument(
      "block",
      { ...parentDoc.value, ghostChildId: null },
      parentBlockId,
    ).pipe(Effect.catchAll(() => Effect.void));
  }

  const ghostBlockId = Id.makeFrameBlockId(params.frameId, params.ghostNodeId);
  const ghostDoc = yield* Store.getDocument("block", ghostBlockId);
  if (Option.isSome(ghostDoc)) {
    yield* Store.setDocument(
      "block",
      { ...ghostDoc.value, ghostParentId: null, selection: null },
      ghostBlockId,
    ).pipe(Effect.catchAll(() => Effect.void));
  }
});
