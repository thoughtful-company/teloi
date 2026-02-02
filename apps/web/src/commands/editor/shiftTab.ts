import { BufferT } from "@/services/ui/Buffer";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

const scope = "editor";
const commandName = "shiftTab";
const tag = `${scope}:${commandName}` as const;

export class ShiftTab extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: ShiftTab) {
    const Buffer = yield* BufferT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;

    const { bufferId, nodeId } = ctx.value;

    yield* Buffer.outdent(bufferId, [nodeId]);

    // Re-set selection to trigger ancestor expansion
    const selection = yield* Buffer.getSelection(bufferId);
    yield* Buffer.setSelection(bufferId, selection);
  });
}
