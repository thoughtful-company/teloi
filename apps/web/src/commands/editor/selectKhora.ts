import { FrameT } from "@/services/ui/Frame";
import { Data, Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "./utils/resolveActiveKhoraContext";

const scope = "editor";
const commandName = "selectBlock";
const tag = `${scope}:${commandName}` as const;

export class SelectBlock extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: SelectBlock) {
    const ctxOpt = yield* resolveActiveKhoraContext();
    if (Option.isNone(ctxOpt)) return;

    const { frameId, nodeId } = ctxOpt.value;
    const Frame = yield* FrameT;

    yield* Frame.enterKhoraSelection(frameId);
    yield* Frame.setSelection(frameId, Option.none());
    yield* Frame.setKhoraSelection(frameId, [nodeId], nodeId);
  });
}
