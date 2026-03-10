import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "./resolveActiveKhoraContext";

export const mergeForward = Effect.fn("mergeForward")(function* () {
  const ctx = yield* resolveActiveKhoraContext();
  if (Option.isNone(ctx)) return;
  const { frameId, nodeId, khoraId } = ctx.value;

  const View = yield* ViewT;
  const targetOpt = yield* View.resolveBlockBelow(khoraId);
  if (Option.isNone(targetOpt)) return;

  const targetKhoraId = targetOpt.value;
  const isEligible = yield* isMergeTargetEligible(khoraId, targetKhoraId, View);
  if (!isEligible) return;

  const targetCtx = Id.parseKhoraContextSync(targetKhoraId);
  if (targetCtx.type !== "frame") return;
  const targetNodeId = targetCtx.nodeId;

  const Node = yield* NodeT;

  // Merging a block with children would orphan them
  const targetChildren = yield* View.getChildren(targetKhoraId);
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
    makeCollapsedSelection(khoraId, mergePoint),
  );
  yield* Editor.setCursor(mergePoint);
});

// ================================ Internal ==================================

const isMergeTargetEligible = Effect.fn("mergeForward:isMergeTargetEligible")(
  function* (
    khoraId: Id.Khora,
    targetKhoraId: Id.Khora,
    View: ViewT["Type"],
  ) {
    // Allow merge into first child (parent -> first child merge).
    const children = yield* View.getChildren(khoraId);
    if (children[0] === targetKhoraId) {
      return true;
    }

    // Otherwise only allow immediate next sibling under the same parent.
    const parentOpt = yield* View.getParent(khoraId);
    const targetParentOpt = yield* View.getParent(targetKhoraId);
    if (Option.isNone(parentOpt) || Option.isNone(targetParentOpt)) {
      return false;
    }
    if (parentOpt.value !== targetParentOpt.value) {
      return false;
    }

    const siblings = yield* View.getChildren(parentOpt.value);
    const currentIndex = siblings.indexOf(khoraId);
    return currentIndex >= 0 && siblings[currentIndex + 1] === targetKhoraId;
  },
);
