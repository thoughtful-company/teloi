import { BufferT } from "@/services/ui/Buffer";
import { Data, Effect } from "effect";

const scope = "buffer";
const commandName = "openTypePicker";
const tag = `${scope}:${commandName}` as const;

export class OpenTypePicker extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: OpenTypePicker) {
    const Buffer = yield* BufferT;
    const mode = yield* Buffer.getMode();

    if (mode.type !== "blockSelection") return;

    yield* Buffer.openPopup(mode.bufferId, {
      type: "typePicker",
      query: "",
    });
  });
}
