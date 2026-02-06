import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const mergeForward = Effect.fn("mergeForward")(function* () {
  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { frameId, nodeId, blockId } = ctx.value;

  const View = yield* ViewT;
  const targetOpt = yield* View.resolveBlockBelow(blockId);
  if (Option.isNone(targetOpt)) return;

  const targetBlockId = targetOpt.value;
  const targetCtx = Id.parseBlockContextSync(targetBlockId);
  if (targetCtx.type !== "frame") return;
  const targetNodeId = targetCtx.nodeId;

  const Node = yield* NodeT;

  // Merging a block with children would orphan them
  const targetChildren = yield* Node.getNodeChildren(targetNodeId);
  if (targetChildren.length > 0) return;

  const Automerge = yield* AutomergeT;
  const currentText = yield* Automerge.getText(nodeId);
  const mergePoint = currentText.length;
  const targetText = yield* Automerge.getText(targetNodeId);

  yield* Automerge.setText(nodeId, currentText + targetText);
  yield* Node.deleteNode(targetNodeId);
  yield* Automerge.deleteText(targetNodeId);

  const Frame = yield* FrameT;
  const Editor = yield* EditorT;

  yield* Frame.setSelection(
    frameId,
    makeCollapsedSelection(blockId, mergePoint),
  );
  yield* Editor.setCursor(mergePoint);
});
