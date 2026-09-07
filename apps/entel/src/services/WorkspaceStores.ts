import { createStore } from "@livestore/livestore";
import { Context, Duration, Effect, Layer, RcMap } from "effect";
import { StoreUnavailable } from "../api/Errors.ts";
import { WorkspaceId, WorkspaceNotFound } from "../api/Workspaces.ts";
import { registryCalls, workspaces } from "./Registry.ts";
import { StoreAdapter, storeOptions, TracerLive } from "./StoreAdapter.ts";
import {
  makeStoreCalls,
  type StoreCalls,
  storeUnavailable,
} from "./StoreCalls.ts";
import { schema } from "./WorkspaceSchema.ts";

// A workspace's store together with the calls into it, bound once when the
// store opens, so every caller goes through the same commit and error path.
export type WorkspaceStore = StoreCalls<typeof schema>;

// One LiveStore store per workspace, with the workspace id as the store id, so
// each workspace has its own event log and SQLite file under ENTEL_DATA_DIR
// and can later be synced or shared on its own. Stores open on first use and
// stay open until the layer is torn down.
export class WorkspaceStores extends Context.Service<
  WorkspaceStores,
  {
    readonly open: (
      workspaceId: WorkspaceId,
    ) => Effect.Effect<WorkspaceStore, WorkspaceNotFound | StoreUnavailable>;
    // Every workspace the registry knows, in registry order, each with its
    // store open. The one path for a read that spans workspaces, so the
    // registry is asked once and no id needs a second check.
    readonly openAll: () => Effect.Effect<
      ReadonlyArray<OpenedWorkspace>,
      StoreUnavailable
    >;
  }
>()("entel/WorkspaceStores") {}

export interface OpenedWorkspace {
  readonly workspaceId: WorkspaceId;
  readonly workspace: WorkspaceStore;
}

export const WorkspaceStoresLive = Layer.effect(
  WorkspaceStores,
  Effect.gen(function* () {
    const registry = yield* registryCalls;
    const { adapter } = yield* StoreAdapter;

    // RcMap boots a key once and shares the boot between concurrent callers.
    // The infinite idle time keeps a store open after the request that opened
    // it has let go, without a timer per release, and the map's own finalizer
    // closes every store when the layer is torn down. Nothing bounds the
    // number of open stores yet; each holds a leader, a SQLite connection and
    // file handles.
    //
    // An infinite idle time also makes RcMap keep a failed lookup, so a failed
    // boot invalidates its own key here, from inside the lookup. That runs
    // once per boot, so it can never remove a later, healthy entry the way an
    // invalidate from each waiter could. It relies on a waiter still holding
    // the entry: with none left, invalidate would close the entry scope from
    // inside the very fiber that runs in it and hang. acquire keeps that
    // promise for open and openAll by making the get uninterruptible.
    const stores: RcMap.RcMap<WorkspaceId, WorkspaceStore, StoreUnavailable> =
      yield* RcMap.make({
        idleTimeToLive: Duration.infinity,
        lookup: (workspaceId: WorkspaceId) =>
          createStore({
            schema,
            adapter,
            storeId: workspaceId,
            ...storeOptions,
          }).pipe(
            Effect.map((opened) => makeStoreCalls(workspaceId, opened)),
            // The whole cause, so a defect inside LiveStore's boot is dropped
            // from the map and answered as a 503 too, instead of staying cached.
            Effect.catchCause((cause) =>
              RcMap.invalidate(stores, workspaceId).pipe(
                Effect.andThen(storeUnavailable(workspaceId, "open", cause)),
              ),
            ),
            Effect.provide(TracerLive),
          ),
      });

    // Only for ids the registry has confirmed. The get is scoped to the call,
    // so it holds no reference once it returns. Holding it under the layer
    // scope instead would add one finalizer there per request for the life of
    // the process. The bundle stays valid after release only because the idle
    // time is infinite and there is no capacity; if either is ever set, this
    // has to hold the reference for the caller's scope instead.
    //
    // Uninterruptible so that a request dropped mid-boot still holds the
    // entry until the boot ends, which the lookup's own invalidate needs. A
    // boot is bounded, so the interrupt is delayed, not lost.
    const acquire = (workspaceId: WorkspaceId) =>
      RcMap.get(stores, workspaceId).pipe(
        Effect.scoped,
        Effect.uninterruptible,
      );

    const open = Effect.fn("WorkspaceStores.open")(function* (
      workspaceId: WorkspaceId,
    ) {
      // The id becomes a directory name under ENTEL_DATA_DIR, so only ids the
      // registry issued may reach the adapter. Checked before the map is
      // touched, so an unknown id leaves nothing behind.
      const known = yield* registry.run("query", () =>
        registry.store.query(
          workspaces.select("id").where({ id: workspaceId }),
        ),
      );
      if (known.length === 0) {
        return yield* new WorkspaceNotFound({ workspaceId });
      }
      return yield* acquire(workspaceId);
    });

    const openAll = Effect.fn("WorkspaceStores.openAll")(function* () {
      const known = yield* registry.run("query", () =>
        registry.store.query(workspaces.select("id").orderBy("seq", "asc")),
      );
      // Boots run concurrently and forEach keeps input order, so the answer
      // is in registry order without a sort. One failed boot fails the whole
      // call; the others are interrupted once their boot ends.
      return yield* Effect.forEach(
        known,
        (id) => {
          const workspaceId = WorkspaceId.make(id);
          return Effect.map(acquire(workspaceId), (workspace) => ({
            workspaceId,
            workspace,
          }));
        },
        { concurrency: "unbounded" },
      );
    });

    return WorkspaceStores.of({ open, openAll });
  }),
);
