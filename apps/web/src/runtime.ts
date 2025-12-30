import { shouldNeverHappen } from "@/error";
import { store } from "@/livestore/store";
import { Effect, Layer, Logger, LogLevel, ManagedRuntime, pipe } from "effect";
import { makeKeyboardLive } from "./services/browser/KeyboardService";
import { makeURLServiceLive } from "./services/browser/URLService";
import { DataPortLive, DataPortT, ExportData } from "./services/domain/DataPort";
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

// Yjs persistence via y-indexeddb. Safe now that migration is removed
// and Yjs is the sole source of truth for text content.
const yjsPersist = true;

const BrowserLayer = pipe(
  NavigationLive,
  Layer.provideMerge(DataPortLive),
  Layer.provideMerge(BlockLive),
  Layer.provideMerge(BufferLive),
  Layer.provideMerge(WindowLive),
  Layer.provideMerge(NodeLive),
  Layer.provideMerge(makeYjsLive({ roomName: "teloi-workspace", persist: yjsPersist })),
  Layer.provideMerge(makeKeyboardLive(window)),
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

  // Console utilities for dev backup
  (window as unknown as { exportData: () => Promise<string> }).exportData =
    async () => {
      const data = await runtime.runPromise(
        Effect.gen(function* () {
          const DataPort = yield* DataPortT;
          return yield* DataPort.exportData();
        }),
      );
      const json = JSON.stringify(data, null, 2);
      console.log(`Exported ${data.data.nodes.length} nodes`);
      return json;
    };

  (
    window as unknown as { importData: (json: string) => Promise<void> }
  ).importData = async (json: string) => {
    const data = JSON.parse(json) as ExportData;
    await runtime.runPromise(
      Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        yield* DataPort.importData(data);
      }),
    );
    console.log(
      `Imported ${data.data.nodes.length} nodes. Refresh page to see changes.`,
    );
  };

  (
    window as unknown as { downloadExport: () => Promise<void> }
  ).downloadExport = async () => {
    const json = await (
      window as unknown as { exportData: () => Promise<string> }
    ).exportData();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `teloi-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // File picker for importing - much easier than pasting JSON
  (
    window as unknown as { loadBackup: () => Promise<void> }
  ).loadBackup = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    const file = await new Promise<File | null>((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.click();
    });

    if (!file) {
      console.log("No file selected");
      return;
    }

    const json = await file.text();
    const data = JSON.parse(json) as ExportData;

    await runtime.runPromise(
      Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        yield* DataPort.importData(data);
      }),
    );

    console.log(
      `Imported ${data.data.nodes.length} nodes from ${file.name}. Refresh page to see changes.`,
    );
  };
}
