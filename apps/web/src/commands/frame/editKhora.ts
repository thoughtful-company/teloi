import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { NodeT } from "@/services/domain/Node";
import { ViewT } from "@/services/ui/View";
import { Data, Effect } from "effect";

const scope = "frame";
const commandName = "editKhora";
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

    if (mode.type !== "khoraSelection") return;

    const { frameId } = mode;
    const state = yield* Frame.getKhoraSelectionState(frameId);
    const targetBlock =
      state.focus ??
      state.anchor ??
      (state.selectedKhoras.length > 0
        ? state.selectedKhoras[state.selectedKhoras.length - 1]!
        : null);

    if (targetBlock != null) {
      const text = yield* Automerge.getText(targetBlock);
      const textLength = text.length;
      const khoraId = Id.makeFrameKhoraId(frameId, targetBlock);

      yield* Frame.enterBlockEditing(khoraId, {
        anchor: textLength,
        head: textLength,
      });
      return;
    }

    const assignedNodeId = yield* Frame.getAssignedNodeId(frameId);
    if (assignedNodeId == null) return;

    const children = yield* Node.getNodeChildren(assignedNodeId);
    if (children.length === 0) {
      const titleBlockId = Id.makeFrameKhoraId(frameId, assignedNodeId);
      const newKhoraId = yield* View.createKhora(titleBlockId, "after");

      yield* Frame.enterBlockEditing(newKhoraId, { anchor: 0, head: 0 });
      return;
    }

    const lastNodeId = children[children.length - 1]!;
    const lastKhoraId = Id.makeFrameKhoraId(frameId, lastNodeId);
    const lastText = yield* Automerge.getText(lastNodeId);

    if (lastText.length === 0) {
      yield* Frame.enterBlockEditing(lastKhoraId, {
        anchor: lastText.length,
        head: lastText.length,
      });
      return;
    }

    const newKhoraId = yield* View.createKhora(lastKhoraId, "after");
    const newCtx = Id.parseKhoraContextSync(newKhoraId);
    if (newCtx.type !== "frame") return;

    yield* Frame.enterBlockEditing(newKhoraId, { anchor: 0, head: 0 });
  });
}
