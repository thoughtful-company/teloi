import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const mergeForward = Effect.fn("mergeForward")(function* () {
  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { bufferId, nodeId, blockId } = ctx.value;

  const ViewNav = yield* ViewNavigationT;
  const targetOpt = yield* ViewNav.resolveBlockBelow(nodeId, bufferId);
  if (Option.isNone(targetOpt)) return;

  const targetId = targetOpt.value;
  const Node = yield* NodeT;

  // Merging a block with children would orphan them
  const targetChildren = yield* Node.getNodeChildren(targetId);
  if (targetChildren.length > 0) return;

  const Automerge = yield* AutomergeT;
  const currentText = yield* Automerge.getText(nodeId);
  const mergePoint = currentText.length;
  const targetText = yield* Automerge.getText(targetId);

  yield* Automerge.setText(nodeId, currentText + targetText);
  yield* Node.deleteNode(targetId);
  yield* Automerge.deleteText(targetId);

  const Buffer = yield* BufferT;
  const Editor = yield* EditorT;

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(blockId, mergePoint),
  );
  yield* Editor.setCursor(mergePoint);
});
