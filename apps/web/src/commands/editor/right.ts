import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "right";
const tag = `${scope}:${commandName}` as const;

export class Right extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Right) {
    const Editor = yield* EditorT;

    const isAtEnd = yield* Editor.isCursorAtEnd();
    if (!isAtEnd) {
      yield* Editor.moveRight();
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    const View = yield* ViewT;
    const Frame = yield* FrameT;

    const ctx = yield* resolveActiveKhoraContext();
    if (Option.isNone(ctx)) return;
    const { khoraId } = ctx.value;

    const targetOpt = yield* View.resolveBlockRight(khoraId);
    if (Option.isNone(targetOpt)) return;

    const targetKhoraId = targetOpt.value;

    yield* Frame.enterBlockEditing(targetKhoraId, {
      anchor: 0,
      head: 0,
    });
  });
}
