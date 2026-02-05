import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { BlockT } from "@/services/ui/Block";
import { getBlockDoc } from "@/services/ui/Block/getBlockDoc";
import { BufferT } from "@/services/ui/Buffer";
import { ViewT } from "@/services/ui/View";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const mergeBackward = Effect.fn("mergeBackward")(function* () {
  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { bufferId, nodeId, blockId } = ctx.value;

  const blockDoc = yield* getBlockDoc(bufferId, nodeId);

  // Ghost block: collapse parent (which cleans up the ghost)
  if (blockDoc.ghostParentId) {
    yield* removeGhost(bufferId, blockDoc.ghostParentId);
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
  if (targetCtx.type !== "buffer") return;
  const targetNodeId = targetCtx.nodeId;

  const Automerge = yield* AutomergeT;
  const targetText = yield* Automerge.getText(targetNodeId);
  const currentText = yield* Automerge.getText(nodeId);
  const mergePoint = targetText.length;

  yield* Automerge.setText(targetNodeId, targetText + currentText);
  yield* Node.deleteNode(nodeId);
  yield* Automerge.deleteText(nodeId);

  const Buffer = yield* BufferT;
  const Window = yield* WindowT;

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(targetBlockId, mergePoint),
  );
  yield* Window.setActiveElement(
    Option.some({ type: "block" as const, id: targetBlockId }),
  );
});

// ================================ Internal ==================================

const removeGhost = Effect.fn("mergeBackward:removeGhost")(function* (
  bufferId: Id.Buffer,
  parentNodeId: Id.Node,
) {
  const Block = yield* BlockT;
  const Buffer = yield* BufferT;
  const Window = yield* WindowT;
  const Automerge = yield* AutomergeT;

  const parentBlockId = Id.makeBufferBlockId(bufferId, parentNodeId);
  const parentText = yield* Automerge.getText(parentNodeId);

  yield* Block.setExpanded(parentBlockId, false);

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(parentBlockId, parentText.length),
  );
  yield* Window.setActiveElement(
    Option.some({ type: "block" as const, id: parentBlockId }),
  );
});
