// The package index pulls in the Node SDK and its optional peers. Only the
// tracer service is needed here.
import * as OtelTracer from "@effect/opentelemetry/OtelTracer";
import { makeAdapter } from "@livestore/adapter-node";
import { Events, makeSchema, State } from "@livestore/livestore";
import { Store } from "@livestore/livestore/effect";
import { trace } from "@opentelemetry/api";
import { Config, Effect, Layer, Schema } from "effect";
import { resolve } from "node:path";
import { WorkspaceName } from "../api/Workspaces.ts";

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

// The registry is the one store entel owns itself. Workspaces get their own
// stores later; this one only knows which of them exist.
export class Registry extends Store.Tag(schema, "registry") {}

// Spelled out because the inferred type names @livestore/common, which entel
// does not depend on directly, and tsc refuses to emit that.
export const RegistryLive: Layer.Layer<
  Layer.Success<RegistryLayer>,
  Layer.Error<RegistryLayer> | Config.ConfigError
> = Layer.unwrap(
  Effect.gen(function* () {
    const dataDir = yield* Config.string("ENTEL_DATA_DIR").pipe(
      Config.withDefault(defaultDataDir),
    );
    return Registry.layer({
      adapter: makeAdapter({ storage: { type: "fs", baseDirectory: dataDir } }),
      // Devtools would start a Vite server. batchUpdates exists for UI
      // frameworks that coalesce renders; the server has nothing to coalesce.
      disableDevtools: true,
      batchUpdates: (run) => run(),
    }).pipe(
      // LiveStore spans go to whatever tracer provider is registered globally.
      // None is, so this is the API's no-op tracer until entel exports traces.
      Layer.provide(
        Layer.succeed(OtelTracer.OtelTracer, trace.getTracer("entel")),
      ),
    );
  }),
);

// ================================ Internal ===================================

type RegistryLayer = ReturnType<typeof Registry.layer>;

// apps/entel/data, whatever the working directory is, so `node
// apps/entel/src/main.ts` from the repo root and `pnpm dev:entel` agree.
const defaultDataDir = resolve(import.meta.dirname, "../../data");
