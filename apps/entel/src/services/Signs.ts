import { nanoid } from "@livestore/livestore";
import { Context, Effect, Layer } from "effect";
import { StoreUnavailable } from "../api/Errors.ts";
import { Sign, SignId, SignTitle, WorkspaceSign } from "../api/Signs.ts";
import type { WorkspaceId, WorkspaceNotFound } from "../api/Workspaces.ts";
import { events, signs } from "./WorkspaceSchema.ts";
import { type WorkspaceStore, WorkspaceStores } from "./WorkspaceStores.ts";

export class Signs extends Context.Service<
  Signs,
  {
    readonly create: (
      workspaceId: WorkspaceId,
      title: SignTitle,
    ) => Effect.Effect<Sign, WorkspaceNotFound | StoreUnavailable>;
    readonly list: (
      workspaceId: WorkspaceId,
    ) => Effect.Effect<
      ReadonlyArray<Sign>,
      WorkspaceNotFound | StoreUnavailable
    >;
    readonly listAll: () => Effect.Effect<
      ReadonlyArray<WorkspaceSign>,
      StoreUnavailable
    >;
  }
>()("entel/Signs") {}

export const SignsLive = Layer.effect(
  Signs,
  Effect.gen(function* () {
    const workspaceStores = yield* WorkspaceStores;

    const create = Effect.fn("Signs.create")(function* (
      workspaceId: WorkspaceId,
      title: SignTitle,
    ) {
      const workspace = yield* workspaceStores.open(workspaceId);
      // Constructing first validates the title, so nothing reaches the log
      // that the caller would not get back.
      const sign = new Sign({ id: SignId.make(nanoid()), title });
      yield* workspace
        .commit(events.signCreated(sign))
        .pipe(
          Effect.andThen(Effect.logInfo("[Signs.create] sign created")),
          Effect.annotateLogs({ workspaceId, signId: sign.id, title }),
        );
      return sign;
    });

    const list = Effect.fn("Signs.list")(function* (workspaceId: WorkspaceId) {
      const workspace = yield* workspaceStores.open(workspaceId);
      return yield* signsIn(workspace);
    });

    // No SQL spans two stores, so this reads every workspace's store and
    // concatenates in memory. openAll answers in registry order and the
    // per-workspace query in sign order, so the result is stable without a
    // sort. The first read after a restart boots every store and pays for it
    // once.
    const listAll = Effect.fn("Signs.listAll")(function* () {
      const opened = yield* workspaceStores.openAll();
      const perWorkspace = yield* Effect.forEach(
        opened,
        ({ workspaceId, workspace }) =>
          Effect.map(signsIn(workspace), (rows) =>
            rows.map((sign) => new WorkspaceSign({ workspaceId, sign })),
          ),
      );
      return perWorkspace.flat();
    });

    return Signs.of({ create, list, listAll });
  }),
);

// ================================ Internal ===================================

const signsIn = (
  workspace: WorkspaceStore,
): Effect.Effect<ReadonlyArray<Sign>, StoreUnavailable> =>
  Effect.map(
    workspace.run("query", () =>
      workspace.store.query(signs.select("id", "title").orderBy("seq", "asc")),
    ),
    (rows) =>
      rows.map(
        (row) =>
          new Sign({
            id: SignId.make(row.id),
            title: SignTitle.make(row.title),
          }),
      ),
  );
