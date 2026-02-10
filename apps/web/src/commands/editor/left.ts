import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { ViewT } from "@/services/ui/View";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

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
      const ctx = yield* resolveActiveBlockContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    const View = yield* ViewT;
    const Frame = yield* FrameT;
    const Automerge = yield* AutomergeT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;
    const { frameId, blockId } = ctx.value;

    const targetOpt = yield* View.resolveBlockLeft(blockId);
    if (Option.isNone(targetOpt)) return;

    const targetBlockId = targetOpt.value;
    const targetCtx = Id.parseBlockContextSync(targetBlockId);
    if (targetCtx.type !== "frame") return;

    const targetText = yield* Automerge.getText(targetCtx.nodeId);
    const endPos = targetText.length;

    yield* Frame.setSelection(
      frameId,
      makeCollapsedSelection(targetBlockId, endPos),
    );
    yield* Frame.enterBlockEditing(targetBlockId);
  });
}
