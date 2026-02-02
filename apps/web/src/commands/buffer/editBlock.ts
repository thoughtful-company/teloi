import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { Data, Effect, Option } from "effect";

const scope = "buffer";
const commandName = "editBlock";
const tag = `${scope}:${commandName}` as const;

export class EditBlock extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: EditBlock) {
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;
    const mode = yield* Buffer.getMode();

    if (mode.type !== "blockSelection") return;

    const { bufferId } = mode;
    const state = yield* Buffer.getBlockSelectionState(bufferId);
    const targetBlock = state.focus ?? state.anchor;
    if (!targetBlock) return;

    const text = yield* Automerge.getText(targetBlock);
    const textLength = text.length;
    const blockId = Id.makeBufferBlockId(bufferId, targetBlock);

    yield* Buffer.setSelection(
      bufferId,
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
    yield* Buffer.setBlockSelection(bufferId, [], targetBlock);
    yield* Buffer.enterBlockEditing(blockId);
  });
}
