import { shouldNeverHappen } from "@/error";
import { store } from "@/livestore/store";
import { Effect, Layer, Logger, LogLevel, ManagedRuntime, pipe } from "effect";
import { makeKeyboardLive } from "./services/browser/Keyboard";
import { makeURLServiceLive } from "./services/browser/URLService";
import { BootstrapLive } from "./services/domain/Bootstrap";
import {
  DataPortLive,
  DataPortT,
  ExportData,
} from "./services/domain/DataPort";
import { NodeLive } from "./services/domain/Node";
import { TupleLive } from "./services/domain/Tuple";
import { TypeLive } from "./services/domain/Type";
import { getStoreLayer } from "./services/external/Store";
import { makeAutomergeLive } from "./services/external/Automerge";
import { BlockLive } from "./services/ui/Block";
import { registerBuiltInTypes } from "./services/ui/BlockType/definitions";
import { FrameLive } from "./services/ui/Frame";
import { TitleLive } from "./services/ui/Title";
import { NavigationLive } from "./services/ui/Navigation";
import { PickerLive } from "./services/ui/Picker";
import { TypePickerLive } from "./services/ui/TypePicker";
import { TypeColorLive } from "./services/ui/TypeColor";
import { PropertyLive } from "./services/ui/Property";
import { ChatLive } from "./services/ui/Chat";
import { ChatProviderLive } from "./services/external/ChatProvider";
import { ViewLive } from "./services/ui/View";
import { CommandBusLive } from "./services/ui/CommandBus";
import { KeyEventBusLive } from "./services/ui/KeyEventBus";
import { EditorLive } from "./services/ui/Editor";
import { WorldLive } from "./services/ui/World";

registerBuiltInTypes();

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

// Automerge persistence via IndexedDB
const automergePersist = true;

// Group layers to avoid pipe's argument limit (max 20)
const PropertyChatLive = Layer.merge(PropertyLive, ChatLive);
const TypePickerGroup = Layer.provideMerge(PickerLive, TypePickerLive);
// Group DataPort and Bootstrap (both independent domain services)
const DataPortBootstrapGroup = Layer.merge(DataPortLive, BootstrapLive);
// Group Keyboard and URL browser services
const BrowserServicesGroup = Layer.merge(
  makeKeyboardLive(window),
  makeURLServiceLive(window),
);
// Group KeyEventBus and CommandBus (CommandBus provides to KeyEventBus)
const EventCommandBusGroup = Layer.provideMerge(
  KeyEventBusLive,
  CommandBusLive,
);
// Group Editor and View (both need FrameT, WorldT from below)
const EditorViewGroup = Layer.merge(EditorLive, ViewLive);

const BrowserLayer = pipe(
  DataPortBootstrapGroup,
  Layer.provideMerge(TitleLive),
  Layer.provideMerge(EventCommandBusGroup), // KeyEventBus + CommandBus
  Layer.provideMerge(NavigationLive),
  Layer.provideMerge(EditorViewGroup), // EditorLive + ViewLive
  // BlockLive needs TypeT, PickerT from layers below
  Layer.provideMerge(BlockLive),
  Layer.provideMerge(TypePickerGroup),
  Layer.provideMerge(TypeColorLive),
  Layer.provideMerge(FrameLive),
  Layer.provideMerge(PropertyChatLive),
  Layer.provideMerge(Layer.merge(WorldLive, ChatProviderLive)),
  Layer.provideMerge(TupleLive),
  Layer.provideMerge(TypeLive),
  Layer.provideMerge(NodeLive),
  Layer.provideMerge(
    makeAutomergeLive({
      workspaceName: "teloi-workspace-v2",
      persist: automergePersist,
    }),
  ),
  Layer.provideMerge(BrowserServicesGroup),
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
  (window as unknown as { loadBackup: () => Promise<void> }).loadBackup =
    async () => {
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
