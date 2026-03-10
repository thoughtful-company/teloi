import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { Data, Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";
import { resolveGoalX } from "./utils/resolveGoalX";

const scope = "editor";
const commandName = "up";
const tag = `${scope}:${commandName}` as const;

export class Up extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Up) {
    const Editor = yield* EditorT;

    const isOnFirstLine = yield* Editor.isCursorOnFirstLine();
    if (!isOnFirstLine) {
      yield* Editor.moveUp();
      return;
    }

    const View = yield* ViewT;
    const Frame = yield* FrameT;

    const ctx = yield* resolveActiveKhoraContext();
    if (Option.isNone(ctx)) return;
    const { frameId, khoraId } = ctx.value;

    const targetOpt = yield* View.resolveBlockAbove(khoraId);
    if (Option.isNone(targetOpt)) return;

    const goalX = yield* resolveGoalX(frameId);
    const targetKhoraId = targetOpt.value;

    yield* Frame.enterBlockEditing(targetKhoraId, {
      anchor: 0,
      head: 0,
      goalX,
      goalLine: "last",
    });
  });
}
