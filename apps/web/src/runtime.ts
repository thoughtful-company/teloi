import { shouldNeverHappen } from "@/error";
import { store } from "@/livestore/store";
import { Effect, Layer, Logger, LogLevel, ManagedRuntime, pipe } from "effect";
import { makeURLServiceLive } from "./services/browser/URLService";
import { NodeLive } from "./services/domain/Node";
import { getStoreLayer } from "./services/external/Store";
import { makeYjsLive } from "./services/external/Yjs";
import { BlockLive } from "./services/ui/Block";
import { BufferLive } from "./services/ui/Buffer";
import { NavigationLive } from "./services/ui/Navigation";
import { WindowLive } from "./services/ui/Window";

const getStoreOrThrow = () => {
  const _store = store();
  return _store
    ? Effect.succeed(_store)
    : shouldNeverHappen("Store cannot be empty");
};

const getLoggerLayer = (): Layer.Layer<never> => {
  const env = process.env.NODE_ENV;
  const logFormat = process.env.LOG_FORMAT;

  if (logFormat === "json") {
    return Logger.json;
  }

  if (logFormat === "structured") {
    return Logger.structured;
  }

  if (env === "production") {
    return Logger.json;
  }

  // Pretty logger for development
  return Logger.pretty;
};

// Disable Yjs IndexedDB persistence in dev mode due to Vite worker issues
// See: https://github.com/vitejs/vite/issues/16214
const yjsPersist = !import.meta.env.DEV;

const BrowserLayer = pipe(
  NavigationLive,
  Layer.provideMerge(BlockLive),
  Layer.provideMerge(BufferLive),
  Layer.provideMerge(WindowLive),
  Layer.provideMerge(NodeLive),
  Layer.provideMerge(makeYjsLive({ roomName: "teloi-workspace", persist: yjsPersist })),
  Layer.provideMerge(makeURLServiceLive(window)),
  Layer.provideMerge(getStoreLayer(getStoreOrThrow())),
  Layer.provideMerge(Logger.minimumLogLevel(LogLevel.Trace)),
  Layer.provideMerge(getLoggerLayer()),
);

type EnvOf<L> = L extends Layer.Layer<infer R, unknown, unknown> ? R : never;

export type BrowserRequirements = EnvOf<typeof BrowserLayer>;

export const runtime = ManagedRuntime.make(BrowserLayer);

export type BrowserRuntime = typeof runtime;

if (import.meta.env.DEV) {
  (window as unknown as { runtime: BrowserRuntime }).runtime = runtime;
}
