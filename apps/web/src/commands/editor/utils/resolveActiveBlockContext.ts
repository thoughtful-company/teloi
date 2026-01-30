import { Id } from "@/schema";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";

interface ActiveBlockContext {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  blockId: Id.Block;
}

export const resolveActiveBlockContext = Effect.fn("resolveActiveBlockContext")(
  function* () {
    const Window = yield* WindowT;

    const activeElement = yield* Window.getActiveElement();
    if (Option.isNone(activeElement) || activeElement.value.type !== "block") {
      return Option.none<ActiveBlockContext>();
    }

    const blockId = activeElement.value.id;
    const blockContext = Id.parseBlockContextSync(blockId);
    if (blockContext.type !== "buffer") {
      return Option.none<ActiveBlockContext>();
    }

    return Option.some({
      bufferId: blockContext.bufferId,
      nodeId: blockContext.nodeId,
      blockId,
    });
  },
);
