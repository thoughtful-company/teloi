import { EditorT } from "@/services/ui/Editor";
import { Data, Effect } from "effect";
import { mergeBackward } from "./utils/mergeBackward";

const scope = "editor";
const commandName = "backspace";
const tag = `${scope}:${commandName}` as const;

export class Backspace extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Backspace) {
    const Editor = yield* EditorT;

    const isAtStart = yield* Editor.isCursorAtStart();
    if (!isAtStart) {
      yield* Editor.deleteBackward();
      return;
    }

    yield* mergeBackward();
  });
}
