import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { Effect } from "effect";

export const blur = (frameId: Id.Frame, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Frame = yield* FrameT;

    // Title is just the root block of a frame
    const titleBlockId = Id.makeFrameKhoraId(frameId, nodeId);

    // Only clear if focus still points to this title block.
    const mode = yield* Frame.getMode();
    if (mode.type === "khora" && mode.khoraId === titleBlockId) {
      yield* Frame.clearFocus();
    }
  });
