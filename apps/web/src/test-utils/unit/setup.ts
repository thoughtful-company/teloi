/**
 * Unit test setup utilities.
 * Uses real service layers with in-memory LiveStore (via adapter-node).
 * Runs in Node — no browser, no DOM, no SolidJS.
 */

import { schema } from "@/livestore/schema";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive } from "@/services/domain/Type";
import { makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer } from "@/services/external/Store";
import { ViewLive } from "@/services/ui/View";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Layer, ManagedRuntime } from "effect";

/**
 * Creates a unit test environment with real services.
 * Provides: ViewT, NodeT, TupleT, TypeT, AutomergeT, StoreT.
 *
 * Call cleanup in beforeEach (before creating the next instance)
 * to tear down the previous runtime and LiveStore.
 */
export const setupUnitTest = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const TestLayer = ViewLive.pipe(
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(
      makeAutomergeLive({ workspaceName: storeId, persist: false }),
    ),
    Layer.provideMerge(getStoreLayer(liveStore)),
  );

  const runtime = ManagedRuntime.make(TestLayer);

  return {
    runtime,
    cleanup: async () => {
      await runtime.dispose();
      await liveStore.shutdown();
    },
  };
};

export type UnitRuntime = Awaited<ReturnType<typeof setupUnitTest>>["runtime"];
