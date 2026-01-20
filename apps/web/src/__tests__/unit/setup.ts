import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { schema } from "@/livestore/schema";
import {
  Effect,
  Layer,
  Logger,
  LogLevel,
  ManagedRuntime,
  pipe,
  Stream,
} from "effect";
import { getStoreLayer } from "@/services/external/Store";
import { makeYjsLive } from "@/services/external/Yjs";
import { DataPortLive } from "@/services/domain/DataPort";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive } from "@/services/domain/Type";
import { BootstrapLive } from "@/services/domain/Bootstrap";
import { TypeColorLive } from "@/services/ui/TypeColor";
import { TypePickerLive } from "@/services/ui/TypePicker";
import { NavigationLive } from "@/services/ui/Navigation";
import { BufferLive } from "@/services/ui/Buffer";
import { WindowLive } from "@/services/ui/Window";
import { URLServiceB } from "@/services/browser/URLService";

/**
 * Creates a mock URL service for unit tests.
 * Tracks path in-memory instead of using real browser APIs.
 */
export const createMockURLService = (initialPath = "/") => {
  let currentPath = initialPath;
  const popstateCallbacks: Array<(path: string) => void> = [];

  return {
    layer: Layer.succeed(URLServiceB, {
      getPath: () => Effect.succeed(currentPath),
      setPath: (path: string) =>
        Effect.sync(() => {
          currentPath = path;
        }),
      popstate: () =>
        Effect.succeed(
          Stream.async<string>((emit) => {
            const handler = (path: string) => emit.single(path);
            popstateCallbacks.push(handler);
            return Effect.sync(() => {
              const idx = popstateCallbacks.indexOf(handler);
              if (idx >= 0) popstateCallbacks.splice(idx, 1);
            });
          }),
        ),
    }),
    /** Simulate browser back/forward navigation */
    simulatePopstate: (path: string) => {
      currentPath = path;
      popstateCallbacks.forEach((cb) => cb(path));
    },
    /** Get current path without going through Effect */
    getCurrentPath: () => currentPath,
    /** Set current path directly (for test setup) */
    setCurrentPath: (path: string) => {
      currentPath = path;
    },
  };
};

export interface SetupUnitTestOptions {
  /** Initial URL path for navigation tests */
  initialPath?: string;
}

/**
 * Creates a minimal unit test environment with in-memory store and Yjs.
 * No browser dependencies - runs in pure Node.js.
 * Each call creates isolated state - perfect for beforeEach.
 */
export const setupUnitTest = async (options?: SetupUnitTestOptions) => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Node adapter with in-memory storage (no browser SQLite WASM)
  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const store = await createStorePromise({ schema, adapter, storeId });

  // Create mock URL service for navigation tests
  const mockURL = createMockURLService(options?.initialPath ?? "/");

  // Build layer with consumers at top, dependencies merged in below
  // (pipe + provideMerge: first layer is the consumer, subsequent layers provide dependencies)
  const TestLayer = pipe(
    // UI services (consumers - depend on everything below)
    NavigationLive,
    Layer.provideMerge(TypePickerLive),
    Layer.provideMerge(TypeColorLive),
    Layer.provideMerge(BufferLive),
    Layer.provideMerge(WindowLive),
    // Domain services
    Layer.provideMerge(BootstrapLive),
    Layer.provideMerge(DataPortLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(NodeLive),
    // External services
    Layer.provideMerge(makeYjsLive({ roomName: storeId, persist: false })),
    Layer.provideMerge(mockURL.layer),
    Layer.provideMerge(getStoreLayer(Effect.succeed(store))),
    Layer.provideMerge(Logger.minimumLogLevel(LogLevel.Error)),
  );

  const testRuntime = ManagedRuntime.make(TestLayer);

  return {
    runtime: testRuntime,
    mockURL,
    cleanup: async () => {
      await testRuntime.dispose();
    },
  };
};

export type UnitRuntime = Awaited<ReturnType<typeof setupUnitTest>>["runtime"];
