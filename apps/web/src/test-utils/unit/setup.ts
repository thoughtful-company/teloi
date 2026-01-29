/**
 * Unit test setup utilities.
 * Uses real service layers with in-memory LiveStore (via adapter-node).
 * Only EditorT is faked — it requires CodeMirror's EditorView (DOM object).
 */

import { schema } from "@/livestore/schema";
import { NodeLive } from "@/services/domain/Node";
import { makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer } from "@/services/external/Store";
import { BufferLive } from "@/services/ui/Buffer";
import {
  makeEditorTest,
  type EditorTestHandle,
} from "@/services/ui/Editor/test";
import { WindowLive } from "@/services/ui/Window";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Layer, ManagedRuntime } from "effect";

export type { EditorTestHandle };

/**
 * Creates a command test environment with real services (except EditorT).
 * Uses in-memory LiveStore via adapter-node for fast, isolated testing.
 */
export const setupCommandTest = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const editorHandle = await Effect.runPromise(makeEditorTest());

  const TestLayer = BufferLive.pipe(
    Layer.provideMerge(WindowLive),
    Layer.provideMerge(editorHandle.layer),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(
      makeAutomergeLive({ workspaceName: storeId, persist: false }),
    ),
    Layer.provideMerge(getStoreLayer(liveStore)),
  );

  const testRuntime = ManagedRuntime.make(TestLayer);

  return {
    runtime: testRuntime,
    editor: editorHandle,
    cleanup: async () => {
      await testRuntime.dispose();
      // LiveStore is created outside the Effect layer system, needs separate teardown
      await liveStore.shutdown();
    },
  };
};

export type CommandRuntime = Awaited<
  ReturnType<typeof setupCommandTest>
>["runtime"];
