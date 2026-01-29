import { Effect } from "effect";

export const EVENT_OCCURS = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.withSpan("When.EVENT_OCCURS"));
