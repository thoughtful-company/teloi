import { schema } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive, TypeT } from "@/services/domain/Type";
import { makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { FrameLive } from "@/services/ui/Frame";
import { KhoraLive, KhoraT } from "@/services/ui/Khora";
import { PickerLive } from "@/services/ui/Picker";
import { TypePickerLive } from "@/services/ui/TypePicker";
import { ViewLive } from "@/services/ui/View";
import { WorldLive } from "@/services/ui/World";
import * as Given from "@/test-utils/bdd/given";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Layer, ManagedRuntime, Option, Stream } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

describe("Khora.subscribe — propertyTitle variant", () => {
  let runtime: Awaited<ReturnType<typeof makeTestRuntime>>["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await makeTestRuntime();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("emits a KhoraView whose textContent is the property title's own text", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Host", []);

      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Price");

      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      const Khora = yield* KhoraT;
      const stream = yield* Khora.subscribe(khoraId);
      const firstEmission = yield* Stream.runHead(stream);
      const view = Option.getOrThrow(firstEmission);

      // Resolves to the property node's text, not the host node's.
      expect(view.textContent).toBe("Price");
    }).pipe(runtime.runPromise);
  });

  it("emits a KhoraView with zero child count and no available views (property titles are leaves)", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Host", []);

      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Price");

      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      const Khora = yield* KhoraT;
      const stream = yield* Khora.subscribe(khoraId);
      const firstEmission = yield* Stream.runHead(stream);
      const view = Option.getOrThrow(firstEmission);

      expect(view.childCount).toBe(0);
      expect(view.availableViews).toHaveLength(0);
    }).pipe(runtime.runPromise);
  });

  it("emits userTypes from the property node for a propertyTitle khora", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Host", []);

      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Price");
      const { typeId } = yield* Given.A_TYPE_WITHOUT_COLOR();
      const Type = yield* TypeT;
      yield* Type.addType(propertyId, typeId);

      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      const Khora = yield* KhoraT;
      const stream = yield* Khora.subscribe(khoraId);
      const firstEmission = yield* Stream.runHead(stream);
      const view = Option.getOrThrow(firstEmission);

      expect(view.userTypes).toEqual([typeId]);
    }).pipe(runtime.runPromise);
  });

  it("isActive reflects frame.activeKhoraId: true when matching, false when null", async () => {
    await Effect.gen(function* () {
      const Store = yield* StoreT;
      const {
        frameId,
        rootNodeId: hostNodeId,
        worldId,
      } = yield* Given.A_FRAME_WITH_CHILDREN("Host", []);

      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Price");
      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      // Mark the frame as the stage's active frame so isStageActiveFrame
      // can become true.
      yield* Store.setDocument(
        "world",
        {
          panes: [],
          activeRegion: "stage" as const,
          activeFrameId: frameId,
        },
        worldId,
      );

      // Scenario A: activeKhoraId matches → isActive === true
      yield* Store.setDocument(
        "frame",
        {
          worldId,
          parent: { id: Id.Pane.make("test-pane"), type: "pane" as const },
          assignedKhoraId: hostNodeId,
          toggledNodes: [],
          activeViewId: null,
          activePart: "khora" as const,
          activeKhoraId: khoraId,
          popup: null,
        },
        frameId,
      );

      const Khora = yield* KhoraT;
      const activeStream = yield* Khora.subscribe(khoraId);
      const activeFirst = yield* Stream.runHead(activeStream);
      const activeView = Option.getOrThrow(activeFirst);
      expect(activeView.isActive).toBe(true);

      // Scenario B: activeKhoraId null → isActive === false
      yield* Store.setDocument(
        "frame",
        {
          worldId,
          parent: { id: Id.Pane.make("test-pane"), type: "pane" as const },
          assignedKhoraId: hostNodeId,
          toggledNodes: [],
          activeViewId: null,
          activeKhoraId: null,
          popup: null,
        },
        frameId,
      );

      const inactiveStream = yield* Khora.subscribe(khoraId);
      const inactiveFirst = yield* Stream.runHead(inactiveStream);
      const inactiveView = Option.getOrThrow(inactiveFirst);
      expect(inactiveView.isActive).toBe(false);
    }).pipe(runtime.runPromise);
  });
});

// ================================ Internal ==================================

const makeTestRuntime = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const TestLayer = KhoraLive.pipe(
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

  const runtime = ManagedRuntime.make(TestLayer);

  return {
    runtime,
    liveStore,
    cleanup: async () => {
      await runtime.dispose();
      await liveStore.shutdown();
    },
  };
};
