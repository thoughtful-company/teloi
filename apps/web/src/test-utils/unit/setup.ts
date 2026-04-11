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
import { getStoreLayer, type TeloiStore } from "@/services/external/Store";
import { FrameLive } from "@/services/ui/Frame";
import { KhoraLive } from "@/services/ui/Khora";
import { PickerLive } from "@/services/ui/Picker";
import { TypePickerLive } from "@/services/ui/TypePicker";
import { ViewLive } from "@/services/ui/View";
import { WorldLive } from "@/services/ui/World";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Layer, ManagedRuntime } from "effect";

/**
 * Generic setup that takes a layer builder. Each test gets its own fresh
 * in-memory LiveStore and disposable runtime. Call `cleanup` in beforeEach
 * (never afterEach) to tear down the previous runtime before the next one
 * boots — see `docs/testing.md`.
 */
export const setupUnitTestWith = async <R>(
  buildLayer: (liveStore: TeloiStore, storeId: string) => Layer.Layer<R>,
  prefix = "test",
) => {
  const storeId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const runtime = ManagedRuntime.make(buildLayer(liveStore, storeId));

  return {
    runtime,
    cleanup: async () => {
      await runtime.dispose();
      await liveStore.shutdown();
    },
  };
};

/**
 * Narrow layer builder: ViewT + the domain/external deps underneath it.
 * Used by tests that don't need Khora/Picker/Frame wiring.
 */
export const buildViewTestLayer = (
  liveStore: TeloiStore,
  storeId: string,
) =>
  ViewLive.pipe(
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(
      makeAutomergeLive({ workspaceName: storeId, persist: false }),
    ),
    Layer.provideMerge(getStoreLayer(liveStore)),
  );

/**
 * Wide layer builder: the full UI service graph — Khora, Picker, TypePicker,
 * Frame, View, World and all their domain/external deps. Heavier than
 * `buildViewTestLayer` but necessary for tests that exercise command handlers
 * or picker flows. Pipe order matters: FrameLive sits below PickerLive so the
 * FrameT dep on PickerLive gets satisfied from below, avoiding a cycle.
 */
export const buildUiTestLayer = (liveStore: TeloiStore, storeId: string) =>
  KhoraLive.pipe(
    Layer.provideMerge(PickerLive),
    Layer.provideMerge(TypePickerLive),
    Layer.provideMerge(FrameLive),
    Layer.provideMerge(ViewLive),
    Layer.provideMerge(WorldLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(
      makeAutomergeLive({ workspaceName: storeId, persist: false }),
    ),
    Layer.provideMerge(getStoreLayer(liveStore)),
  );

/**
 * Legacy narrow setup. Preserved for existing callers; prefer
 * `setupUnitTestWith` + a named builder for new tests.
 */
export const setupUnitTest = () => setupUnitTestWith(buildViewTestLayer);

export type UnitRuntime = Awaited<ReturnType<typeof setupUnitTest>>["runtime"];
