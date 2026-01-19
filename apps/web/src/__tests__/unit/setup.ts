import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { schema } from "@/livestore/schema";
import { Effect, Layer, Logger, LogLevel, ManagedRuntime, pipe } from "effect";
import { getStoreLayer } from "@/services/external/Store";
import { makeYjsLive } from "@/services/external/Yjs";
import { DataPortLive } from "@/services/domain/DataPort";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";

/**
 * Creates a minimal unit test environment with in-memory store and Yjs.
 * No browser dependencies - runs in pure Node.js.
 * Each call creates isolated state - perfect for beforeEach.
 */
export const setupUnitTest = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Node adapter with in-memory storage (no browser SQLite WASM)
  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const store = await createStorePromise({ schema, adapter, storeId });

  const TestLayer = pipe(
    DataPortLive,
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(makeYjsLive({ roomName: storeId, persist: false })),
    Layer.provideMerge(getStoreLayer(Effect.succeed(store))),
    Layer.provideMerge(Logger.minimumLogLevel(LogLevel.Error)),
  );

  const testRuntime = ManagedRuntime.make(TestLayer);

  return {
    runtime: testRuntime,
    cleanup: async () => {
      await testRuntime.dispose();
    },
  };
};

export type UnitRuntime = Awaited<ReturnType<typeof setupUnitTest>>["runtime"];
