import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";

interface ActiveBlockContext {
  frameId: Id.Frame;
  nodeId: Id.Node;
  blockId: Id.Block;
  isTitle: boolean;
}

export const resolveActiveBlockContext = Effect.fn("resolveActiveBlockContext")(
  function* () {
    const Window = yield* WindowT;
    const Frame = yield* FrameT;

    const activeElement = yield* Window.getActiveElement();
    if (Option.isNone(activeElement)) {
      return Option.none<ActiveBlockContext>();
    }

    const el = activeElement.value;

    if (el.type !== "block") {
      return Option.none<ActiveBlockContext>();
    }

    const blockId = el.id;
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
