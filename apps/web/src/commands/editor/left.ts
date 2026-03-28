import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "left";
const tag = `${scope}:${commandName}` as const;

export class Left extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Left) {
    const Editor = yield* EditorT;

    const isAtStart = yield* Editor.isCursorAtStart();
    if (!isAtStart) {
      yield* Editor.moveLeft();
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    const View = yield* ViewT;
    const Frame = yield* FrameT;
    const Automerge = yield* AutomergeT;

    const ctx = yield* resolveActiveKhoraContext();
    if (Option.isNone(ctx)) return;
    const { khoraId } = ctx.value;

    const targetOpt = yield* View.resolveBlockLeft(khoraId);
    if (Option.isNone(targetOpt)) return;

    const targetKhoraId = targetOpt.value;
    const targetCtx = Id.parseKhoraContextSync(targetKhoraId);
    if (targetCtx.type !== "frame") return;

    const targetText = yield* Automerge.getText(targetCtx.nodeId);
    const endPos = targetText.length;

    yield* Frame.enterKhoraEditing(targetKhoraId, {
      anchor: endPos,
      head: endPos,
    });
  });
}
