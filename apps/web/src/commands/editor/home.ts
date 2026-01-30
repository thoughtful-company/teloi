import { EditorT } from "@/services/ui/Editor";
import { Data, Effect } from "effect";

const scope = "editor";
const commandName = "home";
const tag = `${scope}:${commandName}` as const;

export class Home extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Home) {
    const Editor = yield* EditorT;
    yield* Editor.moveHome();
  });
}
