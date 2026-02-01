import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";

interface ActiveBlockContext {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  blockId: Id.Block;
  isTitle: boolean;
}

export const resolveActiveBlockContext = Effect.fn("resolveActiveBlockContext")(
  function* () {
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;

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
    if (blockContext.type !== "buffer") {
      return Option.none<ActiveBlockContext>();
    }

    const assignedNodeId = yield* Buffer.getAssignedNodeId(
      blockContext.bufferId,
    );
    const isTitle = blockContext.nodeId === assignedNodeId;

    return Option.some({
      bufferId: blockContext.bufferId,
      nodeId: blockContext.nodeId,
      blockId,
      isTitle,
    });
  },
);
