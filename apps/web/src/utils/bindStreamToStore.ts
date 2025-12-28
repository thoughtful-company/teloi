// bindEffectStreamToStore.ts
import { Effect, Fiber, Scope, Stream } from "effect";

import { createStore, reconcile } from "solid-js/store";
import type { BrowserRequirements, BrowserRuntime } from "../runtime";

type ShareConfig =
  | { readonly capacity: "unbounded"; readonly replay?: number }
  | {
      readonly capacity: number;
      readonly strategy?: "sliding" | "dropping" | "suspend";
      readonly replay?: number;
    };

/**
 * Bind an Effect Stream to a Solid.js store, applying projected emissions to the store and optionally deduplicating and sharing the stream.
 *
 * @param args.stream - The source Effect `Stream` whose emissions drive the store updates.
 * @param args.project - Projection that maps each stream emission to the store shape.
 * @param args.initial - Initial value used to create the Solid.js store.
 * @param args.equals - Optional comparator that prevents store updates when `equals(current, next)` is `true`.
 * @param args.share - Optional sharing configuration; defaults to an unbounded share that replays the last value.
 * @param args.log - Optional logging hook called with lifecycle messages (e.g., update, skip, dispose).
 * @returns An object with `store` (the Solid.js store) and `start(runtime)` — a function that starts the binding against a `BrowserRuntime` and returns a `dispose` function that stops it.
 */
export function bindStreamToStore<
  S,
  U extends object,
  E,
  R extends BrowserRequirements | Scope.Scope,
>(args: {
  /** Effect that yields the Stream */
  stream: Stream.Stream<S, E, R>;
  /** Map each emission to the UI store shape */
  project: (s: S) => U;
  /** Initial store value */
  initial: U;
  /** Optional top-level dedup */
  equals?: (a: U, b: U) => boolean;
  /** Optional share config; default replays last value so late subscribers get it */
  share?: ShareConfig;
  /** Optional log hook (e.g., msg => console.debug(msg)) */
  log?: (msg: string) => void;
}) {
  const {
    stream,
    project,
    initial,
    equals,
    share = { capacity: "unbounded", replay: 1 },
    log,
  } = args;

  const [store, setStore] = createStore(initial);

  function start(runtime: BrowserRuntime) {
    const program = Effect.scoped(
      Effect.gen(function* () {
        const shared = yield* Stream.share(stream, share);

        yield* Stream.runForEachScoped(shared, (s) =>
          Effect.sync(() => {
            const next = project(s);
            if (!equals || !equals(store, next)) {
              if (log) log("[bind] applying update");
              // Structural diff to minimize DOM/graphs churn
              setStore(reconcile(next));
            } else {
              if (log) log("[bind] skipped (equal)");
            }
          }),
        );
      }),
    );

    const fiber = runtime.runFork(program);

    const dispose = () => {
      runtime.runFork(Fiber.interrupt(fiber));
      if (log) log("[bind] disposed");
    };

    return dispose;
  }

  return { store, start };
}