import { BrowserRuntimeContext } from "@/context/browserRuntime";
import { schema } from "@/livestore/schema";
import { runtime, type BrowserRuntime } from "@/runtime";
import { makeKeyboardLive } from "@/services/browser/KeyboardService";
import { makeURLServiceLive } from "@/services/browser/URLService";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive } from "@/services/domain/Type";
import { getStoreLayer } from "@/services/external/Store";
import { makeYjsLive } from "@/services/external/Yjs";
import { BlockLive } from "@/services/ui/Block";
import { BufferLive } from "@/services/ui/Buffer";
import { TitleLive } from "@/services/ui/Title";
import { WindowLive } from "@/services/ui/Window";
import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { Store } from "@livestore/livestore";
import { getStore } from "@livestore/solid";
import { Effect, Layer, Logger, LogLevel, ManagedRuntime, pipe } from "effect";
import { JSX } from "solid-js";
import { render as solidRender, waitFor } from "solid-testing-library";

export { runtime };
export type { BrowserRuntime };

export function withRuntime(component: () => JSX.Element) {
  return () => (
    <BrowserRuntimeContext.Provider value={runtime}>
      {component()}
    </BrowserRuntimeContext.Provider>
  );
}

export function render(component: () => JSX.Element) {
  solidRender(withRuntime(component));

  return {
    waitForElement: (selector: string) =>
      Effect.promise(() =>
        waitFor(
          () => {
            const el = document.querySelector(selector);
            if (!el) throw new Error(`Element ${selector} not found`);
            return el as HTMLElement;
          },
          { timeout: 2000 },
        ),
      ),
  };
}

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

  // Use getStore from @livestore/solid - same as production code
  const storeAccessor = await getStore<typeof schema>({
    schema,
    storeId,
    adapter: adapterFactory,
  });

  // getStore returns an Accessor - poll until store is ready
  const store = await new Promise<Store<typeof schema>>((resolve) => {
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

  // Build test layer - similar to BrowserLayer but with test store + in-memory Yjs
  const TestLayer = pipe(
    TitleLive,
    Layer.provideMerge(BlockLive),
    Layer.provideMerge(BufferLive),
    Layer.provideMerge(WindowLive),
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(makeYjsLive({ roomName: "test-room", persist: false })),
    Layer.provideMerge(makeKeyboardLive(window)),
    Layer.provideMerge(makeURLServiceLive(window)),
    Layer.provideMerge(getStoreLayer(Effect.succeed(store))),
    Layer.provideMerge(
      Logger.minimumLogLevel(options?.logLevel ?? LogLevel.Error),
    ),
    Layer.provideMerge(Logger.pretty),
  );

  const testRuntime = ManagedRuntime.make(TestLayer);

  const testRender = (ui: () => JSX.Element) => {
    return solidRender(() => (
      <BrowserRuntimeContext.Provider value={testRuntime}>
        {ui()}
      </BrowserRuntimeContext.Provider>
    ));
  };

  const cleanup = async () => {
    await testRuntime.dispose();
  };

  return { runtime: testRuntime, render: testRender, cleanup };
};
