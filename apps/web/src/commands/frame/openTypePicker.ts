import { FrameT } from "@/services/ui/Frame";
import { Data, Effect } from "effect";

const scope = "frame";
const commandName = "openTypePicker";
const tag = `${scope}:${commandName}` as const;

export class OpenTypePicker extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: OpenTypePicker) {
    const Frame = yield* FrameT;
    const mode = yield* Frame.getMode();

    if (mode.type !== "khoraSelection") return;

    yield* Frame.openPopup(mode.frameId, {
      type: "typePicker",
      query: "",
    });
  });
}
