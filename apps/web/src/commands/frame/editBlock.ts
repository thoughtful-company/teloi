import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { NodeT } from "@/services/domain/Node";
import { ViewT } from "@/services/ui/View";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect } from "effect";

const scope = "frame";
const commandName = "editBlock";
const tag = `${scope}:${commandName}` as const;

export class EditBlock extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: EditBlock) {
    void _cmd;
    const Frame = yield* FrameT;
    const Automerge = yield* AutomergeT;
    const Node = yield* NodeT;
    const View = yield* ViewT;
    const mode = yield* Frame.getMode();

    if (mode.type !== "blockSelection") return;

    const { frameId } = mode;
    const state = yield* Frame.getBlockSelectionState(frameId);
    const targetBlock =
      state.focus ??
      state.anchor ??
      (state.selectedBlocks.length > 0
        ? state.selectedBlocks[state.selectedBlocks.length - 1]!
        : null);

    if (targetBlock != null) {
      const text = yield* Automerge.getText(targetBlock);
      const textLength = text.length;
      const blockId = Id.makeFrameBlockId(frameId, targetBlock);

      // Clear block-selection mode first, then persist text selection.
      yield* Frame.setBlockSelection(frameId, [], targetBlock);
      yield* Frame.setSelection(frameId, makeCollapsedSelection(blockId, textLength));
      yield* Frame.enterBlockEditing(blockId);
      return;
    }

    const assignedNodeId = yield* Frame.getAssignedNodeId(frameId);
    if (assignedNodeId == null) return;

    const children = yield* Node.getNodeChildren(assignedNodeId);
    if (children.length === 0) {
      const titleBlockId = Id.makeFrameBlockId(frameId, assignedNodeId);
      const newBlockId = yield* View.createBlock(titleBlockId, "after");

      yield* Frame.setBlockSelection(frameId, [], null);
      yield* Frame.setSelection(frameId, makeCollapsedSelection(newBlockId, 0));
      yield* Frame.enterBlockEditing(newBlockId);
      return;
    }

    const lastNodeId = children[children.length - 1]!;
    const lastBlockId = Id.makeFrameBlockId(frameId, lastNodeId);
    const lastText = yield* Automerge.getText(lastNodeId);

    if (lastText.length === 0) {
      yield* Frame.setBlockSelection(frameId, [], lastNodeId);
      yield* Frame.setSelection(
        frameId,
        makeCollapsedSelection(lastBlockId, lastText.length),
      );
      yield* Frame.enterBlockEditing(lastBlockId);
      return;
    }

    const newBlockId = yield* View.createBlock(lastBlockId, "after");
    const newCtx = Id.parseBlockContextSync(newBlockId);
    if (newCtx.type !== "frame") return;

    yield* Frame.setBlockSelection(frameId, [], newCtx.nodeId);
    yield* Frame.setSelection(frameId, makeCollapsedSelection(newBlockId, 0));
    yield* Frame.enterBlockEditing(newBlockId);
  });
}
