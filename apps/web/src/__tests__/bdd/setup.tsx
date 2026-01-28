import { BrowserRuntimeContext } from "@/context/browserRuntime";
import { schema } from "@/livestore/schema";
import type { BrowserRuntime } from "@/runtime";
import { makeKeyboardLive } from "@/services/browser/Keyboard";
import { makeURLServiceLive } from "@/services/browser/URLService";
import { BootstrapLive } from "@/services/domain/Bootstrap";
import { DataPortLive } from "@/services/domain/DataPort";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive } from "@/services/domain/Type";
import { NavigationLive } from "@/services/ui/Navigation";
import { getStoreLayer } from "@/services/external/Store";
import { makeAutomergeLive } from "@/services/external/Automerge";
import { ActionLive, ActionT } from "@/services/ui/Action";
import { BlockLive } from "@/services/ui/Block";
import { BufferLive } from "@/services/ui/Buffer";
import { TitleLive } from "@/services/ui/Title";
import { TypeColorLive } from "@/services/ui/TypeColor";
import { PickerLive } from "@/services/ui/Picker";
import { TypePickerLive } from "@/services/ui/TypePicker";
import { PropertyLive } from "@/services/ui/Property";
import { ViewLive } from "@/services/ui/View";
import { KeyEventBusLive } from "@/services/ui/KeyEventBus";
import { TextEditorLive } from "@/services/ui/TextEditor";
import { WindowLive } from "@/services/ui/Window";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { Store } from "@livestore/livestore";
import { getStore } from "@livestore/solid";
import {
  Effect,
  Fiber,
  Layer,
  Logger,
  LogLevel,
  ManagedRuntime,
  pipe,
} from "effect";
import { createRoot, JSX } from "solid-js";
import { render as solidRender } from "solid-testing-library";

export type { BrowserRuntime };

export interface SetupClientTestOptions {
  logLevel?: LogLevel.LogLevel;
}

/**
 * Creates a fresh test environment with in-memory store and Yjs.
 * Each call creates isolated state - perfect for beforeEach.
 */
export const setupClientTest = async (options?: SetupClientTestOptions) => {
  const adapterFactory = makeInMemoryAdapter();
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Wrap store initialization in createRoot to prevent SolidJS warnings
  // about computations created outside reactive context
  let disposeRoot: (() => void) | undefined;

  const store = await new Promise<Store<typeof schema>>((resolve) => {
    disposeRoot = createRoot((dispose) => {
      // Use getStore from @livestore/solid - same as production code
      getStore<typeof schema>({
        schema,
        storeId,
        adapter: adapterFactory,
      }).then((storeAccessor) => {
        // Poll until store is ready
        const check = () => {
          const s = storeAccessor();
          if (s) {
            resolve(s);
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });

      return dispose;
    });
  });

  // Build test layer - similar to BrowserLayer but with test store + in-memory Yjs
  // Group layers to avoid pipe's argument limit (max 20)
  const ViewPropertyLive = Layer.merge(ViewLive, PropertyLive);
  const TypePickerGroup = Layer.provideMerge(PickerLive, TypePickerLive);
  // Group DataPort and Bootstrap (both independent domain services)
  const DataPortBootstrapGroup = Layer.merge(DataPortLive, BootstrapLive);
  // Group Keyboard and URL browser services
  const BrowserServicesGroup = Layer.merge(
    makeKeyboardLive(window),
    makeURLServiceLive(window),
  );

  const TestLayer = pipe(
    ActionLive, // needs BlockT from below
    Layer.provideMerge(NavigationLive),
    Layer.provideMerge(DataPortBootstrapGroup),
    Layer.provideMerge(TitleLive),
    Layer.provideMerge(KeyEventBusLive),
    Layer.provideMerge(TextEditorLive), // needs BufferT, WindowT from below
    // BlockLive needs TypeT, PickerT from layers below
    Layer.provideMerge(BlockLive),
    Layer.provideMerge(TypePickerGroup),
    Layer.provideMerge(TypeColorLive),
    Layer.provideMerge(BufferLive),
    Layer.provideMerge(ViewPropertyLive),
    Layer.provideMerge(WindowLive),
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(
      makeAutomergeLive({ workspaceName: "test-workspace", persist: false }),
    ),
    Layer.provideMerge(BrowserServicesGroup),
    Layer.provideMerge(getStoreLayer(Effect.succeed(store))),
    Layer.provideMerge(
      Logger.minimumLogLevel(options?.logLevel ?? LogLevel.Error),
    ),
    Layer.provideMerge(Logger.pretty),
  );

  const testRuntime = ManagedRuntime.make(TestLayer);

  // Start unified keyboard handler (same as App.tsx does)
  // Use no-op callbacks since tests don't need app-level shortcuts
  const keyboardFiber = testRuntime.runFork(
    Effect.gen(function* () {
      const Action = yield* ActionT;
      yield* Action.runKeyboardHandler({
        onToggleSidebar: () => {},
        onOpenCommandPalette: () => {},
      });
    }),
  );

  const testRender = (ui: () => JSX.Element) => {
    return solidRender(() => (
      <BrowserRuntimeContext.Provider value={testRuntime}>
        {ui()}
      </BrowserRuntimeContext.Provider>
    ));
  };

  const cleanup = async () => {
    // Interrupt keyboard handler before disposing runtime
    await testRuntime.runPromise(Fiber.interrupt(keyboardFiber));
    await testRuntime.dispose();
    // Dispose SolidJS reactive root
    disposeRoot?.();
  };

  return { runtime: testRuntime, render: testRender, cleanup };
};
