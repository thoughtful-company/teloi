import { EditorT } from "@/services/ui/Editor";
import { Data, Effect } from "effect";
import { mergeForward } from "./utils/mergeForward";

const scope = "editor";
const commandName = "delete";
const tag = `${scope}:${commandName}` as const;

export class Delete extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Delete) {
    const Editor = yield* EditorT;

    const isAtEnd = yield* Editor.isCursorAtEnd();
    if (!isAtEnd) {
      yield* Editor.deleteForward();
      return;
    }

    yield* mergeForward();
  });
}
