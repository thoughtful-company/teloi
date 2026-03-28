import { EditBlock } from "@/commands/frame/editKhora";
import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { ViewT } from "@/services/ui/View";
import { Data, Effect } from "effect";

const scope = "frame";
const commandName = "space";
const tag = `${scope}:${commandName}` as const;

export class Space extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Space) {
    void _cmd;
    const Frame = yield* FrameT;
    const View = yield* ViewT;
    const mode = yield* Frame.getMode();

    if (mode.type !== "khoraSelection") return;

    const { frameId } = mode;
    const state = yield* Frame.getKhoraSelectionState(frameId);

    if (state.selectedKhoras.length === 0) {
      yield* EditBlock.handle(new EditBlock());
      return;
    }

    const sourceNodeId =
      state.focus ??
      state.anchor ??
      state.selectedKhoras[state.selectedKhoras.length - 1]!;
    const sourceBlockId = Id.makeFrameKhoraId(frameId, sourceNodeId);
    const newKhoraId = yield* View.createKhora(sourceBlockId, "after");
    const newCtx = Id.parseKhoraContextSync(newKhoraId);
    if (newCtx.type !== "frame") return;

    yield* Frame.enterKhoraEditing(newKhoraId, { anchor: 0, head: 0 });
  });
}
