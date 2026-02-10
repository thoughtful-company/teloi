import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { BlockT } from "@/services/ui/Block";
import { getBlockDoc } from "@/services/ui/Block/getBlockDoc";
import { FrameT } from "@/services/ui/Frame";
import { ViewT } from "@/services/ui/View";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const mergeBackward = Effect.fn("mergeBackward")(function* () {
  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { frameId, nodeId, blockId } = ctx.value;

  const blockDoc = yield* getBlockDoc(frameId, nodeId);

  // Ghost block: collapse parent (which cleans up the ghost)
  if (blockDoc.ghostParentId) {
    yield* removeGhost(frameId, blockDoc.ghostParentId);
    return;
  }

  const Node = yield* NodeT;

  // Merging a block with children would orphan them
  const nodeChildren = yield* Node.getNodeChildren(nodeId);
  if (nodeChildren.length > 0) return;

  const View = yield* ViewT;
  const targetOpt = yield* View.resolveBlockAbove(blockId);
  if (Option.isNone(targetOpt)) return;

  const targetBlockId = targetOpt.value;
  const targetCtx = Id.parseBlockContextSync(targetBlockId);
  if (targetCtx.type !== "frame") return;
  const targetNodeId = targetCtx.nodeId;

  const Automerge = yield* AutomergeT;
  const targetText = yield* Automerge.getText(targetNodeId);
  const currentText = yield* Automerge.getText(nodeId);
  const mergePoint = targetText.length;

  yield* Automerge.setText(targetNodeId, targetText + currentText);
  yield* Node.deleteNode(nodeId);
  yield* Automerge.deleteText(nodeId);

  const Frame = yield* FrameT;

  yield* Frame.setSelection(
    frameId,
    makeCollapsedSelection(targetBlockId, mergePoint),
  );
  yield* Frame.enterBlockEditing(targetBlockId);
});

// ================================ Internal ==================================

const removeGhost = Effect.fn("mergeBackward:removeGhost")(function* (
  frameId: Id.Frame,
  parentNodeId: Id.Node,
) {
  const Block = yield* BlockT;
  const Frame = yield* FrameT;
  const Automerge = yield* AutomergeT;

  const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);
  const parentText = yield* Automerge.getText(parentNodeId);

  yield* Block.setExpanded(parentBlockId, false);

  yield* Frame.setSelection(
    frameId,
    makeCollapsedSelection(parentBlockId, parentText.length),
  );
  yield* Frame.enterBlockEditing(parentBlockId);
});
