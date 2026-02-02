import { BufferT } from "@/services/ui/Buffer";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

const scope = "editor";
const commandName = "selectBlock";
const tag = `${scope}:${commandName}` as const;

export class SelectBlock extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: SelectBlock) {
    const ctxOpt = yield* resolveActiveBlockContext();
    if (Option.isNone(ctxOpt)) return;

    const { bufferId, nodeId } = ctxOpt.value;
    const Buffer = yield* BufferT;

    yield* Buffer.enterBlockSelection(bufferId);
    yield* Buffer.setSelection(bufferId, Option.none());
    yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);
  });
}
