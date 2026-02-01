import { EditorT } from "@/services/ui/Editor";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

const scope = "editor";
const commandName = "moveWordLeft";
const tag = `${scope}:${commandName}` as const;

export class MoveWordLeft extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: MoveWordLeft) {
    const Editor = yield* EditorT;
    yield* Editor.moveWordLeft();
    const ctx = yield* resolveActiveBlockContext();
    if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.bufferId);
  });
}
