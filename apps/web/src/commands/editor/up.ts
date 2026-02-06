import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";
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
    const Window = yield* WindowT;
    const Frame = yield* FrameT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;
    const { frameId, blockId } = ctx.value;

    const targetOpt = yield* View.resolveBlockAbove(blockId);
    if (Option.isNone(targetOpt)) return;

    const goalX = yield* resolveGoalX(frameId);
    const targetBlockId = targetOpt.value;

    yield* Frame.setSelection(
      frameId,
      makeCollapsedSelection(targetBlockId, 0, { goalX, goalLine: "last" }),
    );
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  });
}
