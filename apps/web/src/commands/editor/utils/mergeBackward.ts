import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const mergeBackward = Effect.fn("mergeBackward")(function* () {
  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { bufferId, nodeId } = ctx.value;

  const Node = yield* NodeT;

  // Merging a block with children would orphan them
  const nodeChildren = yield* Node.getNodeChildren(nodeId);
  if (nodeChildren.length > 0) return;

  const ViewNav = yield* ViewNavigationT;
  const targetOpt = yield* ViewNav.resolveBlockAbove(nodeId, bufferId);
  if (Option.isNone(targetOpt)) return;

  const targetNodeId = targetOpt.value;
  const Automerge = yield* AutomergeT;
  const targetText = yield* Automerge.getText(targetNodeId);
  const currentText = yield* Automerge.getText(nodeId);
  const mergePoint = targetText.length;

  yield* Automerge.setText(targetNodeId, targetText + currentText);
  yield* Node.deleteNode(nodeId);
  yield* Automerge.deleteText(nodeId);

  const Buffer = yield* BufferT;
  const Window = yield* WindowT;
  const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(targetBlockId, mergePoint),
  );
  yield* Window.setActiveElement(
    Option.some({ type: "block" as const, id: targetBlockId }),
  );
});
