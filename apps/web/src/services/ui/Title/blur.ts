import { Id } from "@/schema";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";

export const blur = (frameId: Id.Frame, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;

    // Title is just the root block of a frame
    const titleBlockId = Id.makeFrameBlockId(frameId, nodeId);

    // Only clear if activeElement still points to this title.
    // If navigating to a block, activeElement already points there - don't clear.
    const active = yield* Window.getActiveElement();
    if (
      Option.isSome(active) &&
      active.value.type === "block" &&
      active.value.id === titleBlockId
    ) {
      yield* Window.setActiveElement(Option.none());
    }
  });
