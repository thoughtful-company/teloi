import {
  EventSequenceNumber,
  type LiveStoreEvent,
  type LiveStoreSchema,
  type Store,
} from "@livestore/livestore";
import { Duration, Effect, Schedule } from "effect";
import { type StoreOperation, StoreUnavailable } from "../api/Errors.ts";

export interface StoreCalls<TSchema extends LiveStoreSchema> {
  readonly store: Store<TSchema>;
  // Runs one synchronous store call, a query or a status read.
  readonly run: <A>(
    operation: StoreOperation,
    thunk: () => A,
  ) => Effect.Effect<A, StoreUnavailable>;
  // Commits one event and returns once the leader has it on disk.
  readonly commit: (
    event: LiveStoreEvent.Input.ForSchema<TSchema>,
  ) => Effect.Effect<void, StoreUnavailable>;
}

// The one way a store failure becomes a StoreUnavailable. The cause is logged
// in full and only the store and operation names go to the caller, because the
// handler encodes this error straight into a 503. The cause goes in as a
// value, not a string. LiveStore's errors stringify to their tag and keep the
// reason in nested causes.
export const storeUnavailable = (
  store: string,
  operation: StoreOperation,
  cause: unknown,
): Effect.Effect<never, StoreUnavailable> =>
  Effect.logError("[StoreCalls] store unavailable", cause).pipe(
    Effect.annotateLogs({ store, operation }),
    Effect.andThen(new StoreUnavailable({ store, detail: operation })),
  );

// Calls into one LiveStore store, with every way the store can fail turned
// into StoreUnavailable. `name` is what the error reports as the store,
// "registry" or a workspace id.
export const makeStoreCalls = <TSchema extends LiveStoreSchema>(
  name: string,
  store: Store<TSchema>,
): StoreCalls<TSchema> => {
  const unavailable = (operation: StoreOperation, cause: unknown) =>
    storeUnavailable(name, operation, cause);

  // LiveStore calls throw once the store has shut itself down, which it does
  // in the background after a failed commit. Nothing rebuilds the store, so
  // every later call fails the same way until entel restarts.
  const run = <A>(
    operation: StoreOperation,
    thunk: () => A,
  ): Effect.Effect<A, StoreUnavailable> =>
    Effect.try({
      try: thunk,
      catch: (cause) => cause,
    }).pipe(Effect.catch((cause) => unavailable(operation, cause)));

  // commit returns once the event is applied locally. The leader persists it
  // afterwards and moves upstreamHead past it when it has. Answering before
  // that would acknowledge a record a crash could still lose.
  //
  // The status is polled, not subscribed to. LiveStore's status stream reads
  // one shared queue, so concurrent subscribers split its updates and most of
  // them never see the one they wait for.
  //
  // A commit whose materializer fails returns normally; LiveStore logs it and
  // shuts the store down. The local head then has not moved, and that is how
  // the failure is caught before it turns into a 201.
  const commit = (
    event: LiveStoreEvent.Input.ForSchema<TSchema>,
  ): Effect.Effect<void, StoreUnavailable> =>
    Effect.gen(function* () {
      // One synchronous thunk, so no other commit can move the head between
      // these reads.
      const committed = yield* run("commit", () => {
        const before = globalSeq(store.syncStatus().localHead);
        store.commit(event);
        const after = globalSeq(store.syncStatus().localHead);
        if (after <= before) {
          throw new Error("commit did not advance the local head");
        }
        return after;
      });
      yield* run(
        "syncStatus",
        () => globalSeq(store.syncStatus().upstreamHead) >= committed,
      ).pipe(
        Effect.repeat({
          until: (persisted) => persisted,
          schedule: Schedule.spaced(Duration.millis(1)),
        }),
        Effect.timeout(Duration.seconds(10)),
        Effect.catchTag("TimeoutError", (cause) =>
          unavailable("persist", cause),
        ),
      );
    });

  return { store, run, commit };
};

// ================================ Internal ===================================

// SyncStatus heads are strings in LiveStore's own notation. Only the global
// part orders events across the leader boundary. The library's parser throws
// on a shape it does not know, which beats a NaN that would poll for 10 s.
const globalSeq = (head: string): number =>
  EventSequenceNumber.Client.fromString(head).global;
