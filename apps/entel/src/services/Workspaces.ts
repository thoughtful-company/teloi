import { nanoid } from "@livestore/livestore";
import { Context, Effect, Layer } from "effect";
import { StoreUnavailable } from "../api/Errors.ts";
import { Workspace, WorkspaceId, WorkspaceName } from "../api/Workspaces.ts";
import { events, registryCalls, workspaces } from "./Registry.ts";

export class Workspaces extends Context.Service<
  Workspaces,
  {
    readonly create: (
      name: WorkspaceName,
    ) => Effect.Effect<Workspace, StoreUnavailable>;
    readonly list: () => Effect.Effect<
      ReadonlyArray<Workspace>,
      StoreUnavailable
    >;
  }
>()("entel/Workspaces") {}

export const WorkspacesLive = Layer.effect(
  Workspaces,
  Effect.gen(function* () {
    const registry = yield* registryCalls;

    const create = Effect.fn("Workspaces.create")(function* (
      name: WorkspaceName,
    ) {
      // Constructing first validates the name, so nothing reaches the log
      // that the caller would not get back.
      const workspace = new Workspace({ id: WorkspaceId.make(nanoid()), name });
      yield* registry.commit(events.workspaceCreated(workspace)).pipe(
        Effect.andThen(Effect.logInfo("[Workspaces.create] workspace created")),
        // On the failure logs as well, so an operator can tell which command
        // took the store down.
        Effect.annotateLogs({ workspaceId: workspace.id, name }),
      );
      return workspace;
    });

    const list = Effect.fn("Workspaces.list")(function* () {
      const rows = yield* registry.run("query", () =>
        registry.store.query(
          workspaces.select("id", "name").orderBy("seq", "asc"),
        ),
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
