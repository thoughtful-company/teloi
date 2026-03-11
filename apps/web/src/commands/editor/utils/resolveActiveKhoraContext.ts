import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { Effect, Option } from "effect";

interface ActiveKhoraContext {
  frameId: Id.Frame;
  nodeId: Id.Node;
  khoraId: Id.Khora;
  isTitle: boolean;
}

export const resolveActiveKhoraContext = Effect.fn("resolveActiveKhoraContext")(
  function* () {
    const Frame = yield* FrameT;
    const mode = yield* Frame.getMode();
    if (mode.type === "none") {
      return Option.none<ActiveKhoraContext>();
    }
    const frameId = mode.type === "khora" ? Id.parseKhoraContextSync(mode.khoraId).frameId : mode.frameId;
    const selection = yield* Frame.getSelection(frameId);
    if (Option.isNone(selection)) {
      return Option.none<ActiveKhoraContext>();
    }

    const khoraId = selection.value.khoraId;
    const blockContext = Id.parseKhoraContextSync(khoraId);
    if (blockContext.type !== "frame") {
      return Option.none<ActiveKhoraContext>();
    }

    const assignedKhoraId = yield* Frame.getAssignedKhoraId(blockContext.frameId);
    const isTitle = blockContext.nodeId === assignedKhoraId;

    return Option.some({
      frameId: blockContext.frameId,
      nodeId: blockContext.nodeId,
      khoraId,
      isTitle,
    });
  },
);
