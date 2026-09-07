import { Events, makeSchema, State } from "@livestore/livestore";
import { Store } from "@livestore/livestore/effect";
import { Effect, Layer, Schema } from "effect";
import { WorkspaceName } from "../api/Workspaces.ts";
import { StoreAdapter, storeOptions, TracerLive } from "./StoreAdapter.ts";
import { makeStoreCalls, type StoreCalls } from "./StoreCalls.ts";

export const workspaces = State.SQLite.table({
  name: "workspaces",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    name: State.SQLite.text({}),
    // Global sequence number of the creating event. SQLite promises no row
    // order without ORDER BY, and this is the order the log assigned.
    seq: State.SQLite.integer({}),
  },
});

export const events = {
  workspaceCreated: Events.synced({
    name: "v1.WorkspaceCreated",
    // The event carries the domain rule for the name, so a bad name cannot be
    // committed even by a caller that bypasses the HTTP payload schema.
    schema: Schema.Struct({ id: Schema.String, name: WorkspaceName }),
  }),
};

export const schema = makeSchema({
  state: State.SQLite.makeState({
    tables: { workspaces },
    materializers: State.SQLite.materializers(events, {
      "v1.WorkspaceCreated": ({ id, name }, { event }) =>
        workspaces.insert({ id, name, seq: event.seqNum.global }),
    }),
  }),
  events,
});

// The registry is the one store entel owns itself. It only knows which
// workspaces exist; each workspace has a store of its own, see
// WorkspaceStores.ts.
export class Registry extends Store.Tag(schema, "registry") {}

// Spelled out because the inferred type names @livestore/common, which entel
// does not depend on directly, and tsc refuses to emit that.
export const RegistryLive: Layer.Layer<
  Layer.Success<RegistryLayer>,
  Layer.Error<RegistryLayer>,
  StoreAdapter
> = Layer.unwrap(
  Effect.gen(function* () {
    const { adapter } = yield* StoreAdapter;
    return Registry.layer({ adapter, ...storeOptions }).pipe(
      Layer.provide(TracerLive),
    );
  }),
);

// The registry's calls, bound once here so every reader of the registry
// reports it under the same name and goes through the same commit path.
export const registryCalls: Effect.Effect<
  StoreCalls<typeof schema>,
  never,
  Layer.Success<typeof RegistryLive>
> = Effect.map(Registry, ({ store }) => makeStoreCalls("registry", store));

// ================================ Internal ===================================

type RegistryLayer = ReturnType<typeof Registry.layer>;
