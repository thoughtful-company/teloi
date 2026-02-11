import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { Effect, Option } from "effect";

interface ActiveBlockContext {
  frameId: Id.Frame;
  nodeId: Id.Node;
  blockId: Id.Block;
  isTitle: boolean;
}

export const resolveActiveBlockContext = Effect.fn("resolveActiveBlockContext")(
  function* () {
    const Frame = yield* FrameT;
    const mode = yield* Frame.getMode();
    if (mode.type === "none") {
      return Option.none<ActiveBlockContext>();
    }
    const frameId = mode.type === "block" ? Id.parseBlockContextSync(mode.blockId).frameId : mode.frameId;
    const selection = yield* Frame.getSelection(frameId);
    if (Option.isNone(selection)) {
      return Option.none<ActiveBlockContext>();
    }

    const blockId = selection.value.blockId;
    const blockContext = Id.parseBlockContextSync(blockId);
    if (blockContext.type !== "frame") {
      return Option.none<ActiveBlockContext>();
    }

    const assignedNodeId = yield* Frame.getAssignedNodeId(blockContext.frameId);
    const isTitle = blockContext.nodeId === assignedNodeId;

    return Option.some({
      frameId: blockContext.frameId,
      nodeId: blockContext.nodeId,
      blockId,
      isTitle,
    });
  },
);
