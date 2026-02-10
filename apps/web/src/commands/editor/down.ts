import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";
import { resolveGoalX } from "./utils/resolveGoalX";

const scope = "editor";
const commandName = "down";
const tag = `${scope}:${commandName}` as const;

export class Down extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Down) {
    const Editor = yield* EditorT;

    const isOnLastLine = yield* Editor.isCursorOnLastLine();
    if (!isOnLastLine) {
      yield* Editor.moveDown();
      return;
    }

    const View = yield* ViewT;
    const Frame = yield* FrameT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;
    const { frameId, blockId } = ctx.value;

    const targetOpt = yield* View.resolveBlockBelow(blockId);
    if (Option.isNone(targetOpt)) {
      yield* Editor.moveDown();
      return;
    }

    const goalX = yield* resolveGoalX(frameId);
    const targetBlockId = targetOpt.value;

    yield* Frame.setSelection(
      frameId,
      makeCollapsedSelection(targetBlockId, 0, { goalX, goalLine: "first" }),
    );
    yield* Frame.enterBlockEditing(targetBlockId);
  });
}
