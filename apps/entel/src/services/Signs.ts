import { Context, Effect, Layer } from "effect";
import { StoreUnavailable } from "../api/Errors.ts";
import { ObjectId } from "../api/ObjectId.ts";
import { Sign, SignId, SignTitle, WorkspaceSign } from "../api/Signs.ts";
import type { WorkspaceId, WorkspaceNotFound } from "../api/Workspaces.ts";
import { signs } from "./WorkspaceSchema.ts";
import { type WorkspaceStore, WorkspaceStores } from "./WorkspaceStores.ts";

// Reads over the semantic level. Signs are made through Objects, since a sign
// is always a sign of something.
export class Signs extends Context.Service<
  Signs,
  {
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

    return Signs.of({ list, listAll });
  }),
);

// The one place a signs row becomes a Sign, shared with Objects so a field
// added to Sign cannot be decoded in one read and dropped in the other.
export const signFromRow = (row: {
  readonly id: string;
  readonly objectId: string;
  readonly title: string;
}): Sign =>
  new Sign({
    id: SignId.make(row.id),
    objectId: ObjectId.make(row.objectId),
    title: SignTitle.make(row.title),
  });

// ================================ Internal ===================================

const signsIn = (
  workspace: WorkspaceStore,
): Effect.Effect<ReadonlyArray<Sign>, StoreUnavailable> =>
  Effect.map(
    workspace.run("query", () =>
      workspace.store.query(
        signs.select("id", "objectId", "title").orderBy("seq", "asc"),
      ),
    ),
    (rows) => rows.map(signFromRow),
  );
