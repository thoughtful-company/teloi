import { EditorT } from "@/services/ui/Editor";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { mergeBackward } from "./utils/mergeBackward";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

const scope = "editor";
const commandName = "deleteWordBackward";
const tag = `${scope}:${commandName}` as const;

export class DeleteWordBackward extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: DeleteWordBackward) {
    const Editor = yield* EditorT;

    const isAtStart = yield* Editor.isCursorAtStart();
    if (!isAtStart) {
      yield* Editor.deleteWordBackward();
      const ctx = yield* resolveActiveBlockContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    yield* mergeBackward();
  });
}
