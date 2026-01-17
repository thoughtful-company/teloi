import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

/**
 * Get the active view for a buffer.
 * Returns Option.none() if no activeViewId is set or buffer doesn't exist.
 */
export const getActiveView = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const bufferOpt = yield* Store.getDocument("buffer", bufferId);

    if (Option.isNone(bufferOpt)) {
      return Option.none<Id.Node>();
    }

    const activeViewId = bufferOpt.value.activeViewId as Id.Node | null;

    return Option.fromNullable(activeViewId);
  });
