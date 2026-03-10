import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { NavigationT } from "@/services/ui/Navigation";
import { Data, Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "../editor/utils/resolveActiveKhoraContext";

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

    const ctx = yield* resolveActiveKhoraContext();
    if (Option.isNone(ctx)) return;

    const { frameId, nodeId } = ctx.value;

    yield* Navigation.navigateTo(nodeId);

    // After navigation, nodeId is the new title
    const titleBlockId = Id.makeFrameKhoraId(frameId, nodeId);
    yield* Frame.enterBlockEditing(titleBlockId);
  });
}
