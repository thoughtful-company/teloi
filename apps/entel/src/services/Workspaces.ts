import { EventSequenceNumber, nanoid } from "@livestore/livestore";
import { Context, Duration, Effect, Layer, Schedule } from "effect";
import {
  RegistryUnavailable,
  Workspace,
  WorkspaceId,
  WorkspaceName,
} from "../api/Workspaces.ts";
import { events, Registry, workspaces } from "./Registry.ts";

export class Workspaces extends Context.Service<
  Workspaces,
  {
    readonly create: (
      name: WorkspaceName,
    ) => Effect.Effect<Workspace, RegistryUnavailable>;
    readonly list: () => Effect.Effect<
      ReadonlyArray<Workspace>,
      RegistryUnavailable
    >;
  }
>()("entel/Workspaces") {}

export const WorkspacesLive = Layer.effect(
  Workspaces,
  Effect.gen(function* () {
    const { store } = yield* Registry;

    // The cause is logged in full and only the operation name goes to the
    // caller, because the handler encodes this error straight into a 503. The
    // cause goes in as a value, not a string. LiveStore's errors stringify to
    // their tag and keep the reason in nested causes.
    const unavailable = (operation: string, cause: unknown) =>
      Effect.logError("[Workspaces] registry unavailable", cause).pipe(
        Effect.annotateLogs({ operation }),
        Effect.andThen(new RegistryUnavailable({ detail: operation })),
      );

    // LiveStore calls throw once the store has shut itself down, which it does
    // in the background after a failed commit. Nothing rebuilds the store, so
    // every later call fails the same way until entel restarts.
    const useStore = <A>(operation: string, run: () => A) =>
      Effect.try({
        try: run,
        catch: (cause) => cause,
      }).pipe(Effect.catch((cause) => unavailable(operation, cause)));

    // commit returns once the event is applied locally. The leader persists
    // it afterwards and moves upstreamHead past it when it has. Answering
    // before that would acknowledge a workspace a crash could still lose.
    //
    // The status is polled, not subscribed to. LiveStore's status stream
    // reads one shared queue, so concurrent subscribers split its updates
    // and most of them never see the one they wait for.
    //
    // A commit whose materializer fails returns normally; LiveStore logs it
    // and shuts the store down. The local head then has not moved, and that
    // is how the failure is caught before it turns into a 201.
    const commitAndAwaitPersisted = (
      event: ReturnType<typeof events.workspaceCreated>,
    ) =>
      Effect.gen(function* () {
        // One synchronous thunk, so no other commit can move the head between
        // these reads.
        const committed = yield* useStore("commit", () => {
          const before = globalSeq(store.syncStatus().localHead);
          store.commit(event);
          const after = globalSeq(store.syncStatus().localHead);
          if (after <= before) {
            throw new Error("commit did not advance the local head");
          }
          return after;
        });
        yield* useStore(
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

    const create = Effect.fn("Workspaces.create")(function* (
      name: WorkspaceName,
    ) {
      // Constructing first validates the name, so nothing reaches the log
      // that the caller would not get back.
      const workspace = new Workspace({ id: WorkspaceId.make(nanoid()), name });
      yield* commitAndAwaitPersisted(events.workspaceCreated(workspace)).pipe(
        Effect.andThen(Effect.logInfo("[Workspaces.create] workspace created")),
        // On the failure logs as well, so an operator can tell which command
        // took the store down.
        Effect.annotateLogs({ workspaceId: workspace.id, name }),
      );
      return workspace;
    });

    const list = Effect.fn("Workspaces.list")(function* () {
      const rows = yield* useStore("query", () =>
        store.query(workspaces.select("id", "name").orderBy("seq", "asc")),
      );
      return rows.map(
        (row) =>
          new Workspace({
            id: WorkspaceId.make(row.id),
            name: WorkspaceName.make(row.name),
          }),
      );
    });

    return Workspaces.of({ create, list });
  }),
);

// ================================ Internal ===================================

// SyncStatus heads are strings in LiveStore's own notation. Only the global
// part orders events across the leader boundary. The library's parser throws
// on a shape it does not know, which beats a NaN that would poll for 10 s.
const globalSeq = (head: string): number =>
  EventSequenceNumber.Client.fromString(head).global;
