import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { NavigationT } from "@/services/ui/Navigation";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "../editor/utils/resolveActiveBlockContext";

const scope = "frame";
const commandName = "zoomIn";
const tag = `${scope}:${commandName}` as const;

export class ZoomIn extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: ZoomIn) {
    const Navigation = yield* NavigationT;
    const Frame = yield* FrameT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;

    const { frameId, nodeId } = ctx.value;

    yield* Navigation.navigateTo(nodeId);

    // After navigation, nodeId is the new title
    const titleBlockId = Id.makeFrameBlockId(frameId, nodeId);
    yield* Frame.enterBlockEditing(titleBlockId);
  });
}
