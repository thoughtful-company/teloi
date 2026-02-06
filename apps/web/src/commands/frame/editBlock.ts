import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { Data, Effect, Option } from "effect";

const scope = "frame";
const commandName = "editBlock";
const tag = `${scope}:${commandName}` as const;

export class EditBlock extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: EditBlock) {
    const Frame = yield* FrameT;
    const Automerge = yield* AutomergeT;
    const mode = yield* Frame.getMode();

    if (mode.type !== "blockSelection") return;

    const { frameId } = mode;
    const state = yield* Frame.getBlockSelectionState(frameId);
    const targetBlock = state.focus ?? state.anchor;
    if (!targetBlock) return;

    const text = yield* Automerge.getText(targetBlock);
    const textLength = text.length;
    const blockId = Id.makeFrameBlockId(frameId, targetBlock);

    yield* Frame.setSelection(
      frameId,
      Option.some({
        anchor: { elementId: blockId },
        anchorOffset: textLength,
        focus: { elementId: blockId },
        focusOffset: textLength,
        goalX: null,
        goalLine: null,
        assoc: 0,
      }),
    );
    yield* Frame.setBlockSelection(frameId, [], targetBlock);
    yield* Frame.enterBlockEditing(blockId);
  });
}
