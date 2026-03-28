import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { KhoraT } from "@/services/ui/Khora";
import { getKhoraDoc } from "@/services/ui/Khora/getKhoraDoc";
import { FrameT } from "@/services/ui/Frame";
import { ViewT } from "@/services/ui/View";
import { Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "./resolveActiveKhoraContext";

export const mergeBackward = Effect.fn("mergeBackward")(function* () {
  const ctx = yield* resolveActiveKhoraContext();
  if (Option.isNone(ctx)) return;
  const { frameId, nodeId, khoraId } = ctx.value;

  const blockDoc = yield* getKhoraDoc(frameId, nodeId);

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
  const targetOpt = yield* View.resolveBlockAbove(khoraId);
  if (Option.isNone(targetOpt)) return;

  const targetKhoraId = targetOpt.value;
  const targetCtx = Id.parseKhoraContextSync(targetKhoraId);
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

  yield* Frame.enterKhoraEditing(targetKhoraId, {
    anchor: mergePoint,
    head: mergePoint,
  });
});

// ================================ Internal ==================================

const removeGhost = Effect.fn("mergeBackward:removeGhost")(function* (
  frameId: Id.Frame,
  parentNodeId: Id.Node,
) {
  const Khora = yield* KhoraT;
  const Frame = yield* FrameT;
  const Automerge = yield* AutomergeT;

  const parentBlockId = Id.makeFrameKhoraId(frameId, parentNodeId);
  const parentText = yield* Automerge.getText(parentNodeId);

  yield* Khora.setExpanded(parentBlockId, false);

  yield* Frame.enterKhoraEditing(parentBlockId, {
    anchor: parentText.length,
    head: parentText.length,
  });
});
