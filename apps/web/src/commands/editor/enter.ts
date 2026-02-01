import { Data, Effect } from "effect";
import { splitAtCursor } from "./utils/splitAtCursor";

const scope = "editor";
const commandName = "enter";
const tag = `${scope}:${commandName}` as const;

export class Enter extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Enter) {
    yield* splitAtCursor();
  });
}
