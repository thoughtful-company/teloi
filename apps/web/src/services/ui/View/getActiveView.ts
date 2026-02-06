import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

/**
 * Get the active view for a frame.
 * Returns Option.none() if no activeViewId is set or frame doesn't exist.
 */
export const getActiveView = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const frameOpt = yield* Store.getDocument("frame", frameId);

    if (Option.isNone(frameOpt)) {
      return Option.none<Id.Node>();
    }

    const activeViewId = frameOpt.value.activeViewId as Id.Node | null;

    return Option.fromNullable(activeViewId);
  });
