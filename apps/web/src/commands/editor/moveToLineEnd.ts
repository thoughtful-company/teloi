import { EditorT } from "@/services/ui/Editor";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "moveToLineEnd";
const tag = `${scope}:${commandName}` as const;

export class MoveToLineEnd extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: MoveToLineEnd) {
    const Editor = yield* EditorT;
    yield* Editor.moveLineBoundaryRight();
    const ctx = yield* resolveActiveKhoraContext();
    if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
  });
}
