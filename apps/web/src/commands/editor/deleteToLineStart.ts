import { EditorT } from "@/services/ui/Editor";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { mergeBackward } from "./utils/mergeBackward";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "deleteToLineStart";
const tag = `${scope}:${commandName}` as const;

export class DeleteToLineStart extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: DeleteToLineStart) {
    const Editor = yield* EditorT;

    const isAtStart = yield* Editor.isCursorAtStart();
    if (!isAtStart) {
      yield* Editor.deleteToLineStart();
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    yield* mergeBackward();
  });
}
