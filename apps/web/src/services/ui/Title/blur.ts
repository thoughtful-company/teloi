import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";

export const blur = (bufferId: Id.Buffer, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    const Store = yield* StoreT;

    // Title is just the root block of a buffer
    const titleBlockId = Id.makeBufferBlockId(bufferId, nodeId);

    // Only clear if activeElement still points to this title.
    // If navigating to a block, activeElement already points there - don't clear.
    const sessionId = yield* Store.getSessionId();
    const windowId = Id.Window.make(sessionId);
    const windowDoc = yield* Store.getDocument("window", windowId);

    if (Option.isNone(windowDoc)) return;

    const active = windowDoc.value.activeElement;
    if (active && active.type === "block" && active.id === titleBlockId) {
      yield* Window.setActiveElement(Option.none());
    }
  });
