import { Cause, Duration, Effect, Fiber, Option, Schedule } from "effect";
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";

// What a page knows about something on the server: the latest answer, and the
// cause of the last request's failure if it failed. The two stay independent
// so that a refresh that fails does not blank the page, and one that succeeds
// clears the failure. A cause and not only the typed error, because a defect
// in the request would otherwise end the polling with nothing on the page
// saying that it stopped.
export interface Polled<A, E> {
  readonly latest: Accessor<Option.Option<A>>;
  readonly failure: Accessor<Option.Option<Cause.Cause<E>>>;
}

// Asks the server now and again every `every`, for as long as the tab is
// visible. `request` is read in a tracking scope, so a route param it reads
// is a dependency, and each request gets signals of its own: when the param
// changes, the page reads fresh empty signals and the old fiber, interrupted
// but perhaps already holding an answer, can only write into signals nothing
// reads any more. A hidden tab has no fiber at all, and showing the tab again
// starts one, which asks at once. Both rules are held by what exists rather
// than by a flag that a callback checks.
export const createPolled = <A, E>(
  request: () => Effect.Effect<A, E>,
  every: Duration.Input,
): Polled<A, E> => {
  const visible = createVisibility();
  const polled = createMemo(() => {
    const effect = request();
    const [latest, setLatest] = createSignal<Option.Option<A>>(Option.none());
    const [failure, setFailure] = createSignal<Option.Option<Cause.Cause<E>>>(
      Option.none(),
    );
    createEffect(() => {
      if (!visible()) return;
      const fiber = Effect.runFork(
        effect.pipe(
          Effect.matchCauseEffect({
            onSuccess: (value) =>
              Effect.sync(() => {
                setLatest(Option.some(value));
                setFailure(Option.none());
              }),
            // An interrupt is the fiber being stopped on purpose, by the
            // cleanup below, and not something the page should report.
            onFailure: (cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Effect.void
                : Effect.sync(() => setFailure(Option.some(cause))),
          }),
          Effect.repeat({ schedule: Schedule.spaced(every) }),
        ),
      );
      onCleanup(() => {
        Effect.runFork(Fiber.interrupt(fiber));
      });
    });
    return { latest, failure };
  });
  return {
    latest: () => polled().latest(),
    failure: () => polled().failure(),
  };
};

// ================================ Internal ===================================

const createVisibility = (): Accessor<boolean> => {
  const read = () => document.visibilityState === "visible";
  const [visible, setVisible] = createSignal(read());
  const update = () => setVisible(read());
  document.addEventListener("visibilitychange", update);
  onCleanup(() => document.removeEventListener("visibilitychange", update));
  return visible;
};
