// The package index pulls in the Node SDK and its optional peers. Only the
// tracer service is needed here.
import * as OtelTracer from "@effect/opentelemetry/OtelTracer";
import { makeAdapter } from "@livestore/adapter-node";
import { trace } from "@opentelemetry/api";
import { Config, Context, Effect, Layer } from "effect";
import { resolve } from "node:path";

// One adapter for every store entel opens, so they all land under the same
// ENTEL_DATA_DIR. The adapter is a factory: each store passes its own id and
// gets its own subdirectory, leader and SQLite files.
export class StoreAdapter extends Context.Service<
  StoreAdapter,
  { readonly adapter: ReturnType<typeof makeAdapter> }
>()("entel/StoreAdapter") {}

export const StoreAdapterLive = Layer.effect(
  StoreAdapter,
  Effect.gen(function* () {
    const dataDir = yield* Config.string("ENTEL_DATA_DIR").pipe(
      Config.withDefault(defaultDataDir),
    );
    return StoreAdapter.of({
      adapter: makeAdapter({ storage: { type: "fs", baseDirectory: dataDir } }),
    });
  }),
);

// LiveStore spans go to whatever tracer provider is registered globally. None
// is, so this is the API's no-op tracer until entel exports traces.
export const TracerLive = Layer.succeed(
  OtelTracer.OtelTracer,
  trace.getTracer("entel"),
);

// Devtools would start a Vite server. batchUpdates exists for UI frameworks
// that coalesce renders; the server has nothing to coalesce.
export const storeOptions = {
  disableDevtools: true,
  batchUpdates: (run: () => void) => run(),
} as const;

// ================================ Internal ===================================

// apps/entel/data, whatever the working directory is, so `node
// apps/entel/src/main.ts` from the repo root and `pnpm dev:entel` agree.
const defaultDataDir = resolve(import.meta.dirname, "../../data");
