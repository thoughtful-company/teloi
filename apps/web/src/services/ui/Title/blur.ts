import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import { Effect, Option } from "effect";

export const blur = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    const Store = yield* StoreT;

    // Only clear if activeElement still points to this title.
    // If navigating to a block, activeElement already points there - don't clear.
    const sessionId = yield* Store.getSessionId();
    const windowId = Id.Window.make(sessionId);
    const windowDoc = yield* Store.getDocument("window", windowId);

    if (Option.isNone(windowDoc)) return;

    const active = windowDoc.value.activeElement;
    if (active && active.type === "title" && active.bufferId === bufferId) {
      yield* Window.setActiveElement(Option.none());
    }
  });
