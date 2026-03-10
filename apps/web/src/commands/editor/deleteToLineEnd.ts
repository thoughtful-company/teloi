import { EditorT } from "@/services/ui/Editor";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { mergeForward } from "./utils/mergeForward";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "deleteToLineEnd";
const tag = `${scope}:${commandName}` as const;

export class DeleteToLineEnd extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: DeleteToLineEnd) {
    const Editor = yield* EditorT;

    const isAtEnd = yield* Editor.isCursorAtEnd();
    if (!isAtEnd) {
      yield* Editor.deleteToLineEnd();
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.frameId);
      return;
    }

    yield* mergeForward();
  });
}
