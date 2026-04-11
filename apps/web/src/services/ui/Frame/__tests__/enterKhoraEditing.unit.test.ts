import { schema } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive } from "@/services/domain/Type";
import { makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { FrameLive, FrameT } from "@/services/ui/Frame";
import { WorldLive } from "@/services/ui/World";
import * as Given from "@/test-utils/bdd/given";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Layer, ManagedRuntime, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

// ============================================================================

const makeTestRuntime = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const TestLayer = FrameLive.pipe(
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
    cleanup: async () => {
      await runtime.dispose();
      await liveStore.shutdown();
    },
  };
};

describe("Frame.enterKhoraEditing — propertyTitle variant", () => {
  let runtime: Awaited<ReturnType<typeof makeTestRuntime>>["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await makeTestRuntime();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("sets activeKhoraId on the frame doc for a propertyTitle khoraId", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Host", []);
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Price");
      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      const Frame = yield* FrameT;
      yield* Frame.enterKhoraEditing(khoraId, {
        anchor: 2,
        head: 2,
      });

      const Store = yield* StoreT;
      const frameDoc = yield* Store.getDocument("frame", frameId);
      expect(Option.getOrThrow(frameDoc).activeKhoraId).toBe(khoraId);
    }).pipe(runtime.runPromise);
  });

  it("propagates the selection through setSelection (clamped against the property's text)", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId: hostNodeId } =
        yield* Given.A_FRAME_WITH_CHILDREN(
          "A long host page title that is quite lengthy",
          [],
        );
      const propertyId = yield* Given.A_PROPERTY_WITH_TEXT("Bar");
      const khoraId = Id.makePropertyTitleKhoraId(
        frameId,
        hostNodeId,
        propertyId,
      );

      const Frame = yield* FrameT;
      yield* Frame.enterKhoraEditing(khoraId, {
        anchor: 20,
        head: 20,
      });

      const Store = yield* StoreT;
      const khoraDoc = yield* Store.getDocument("khora", khoraId);
      const textSelection = Option.getOrThrow(khoraDoc).textSelection;
      expect(textSelection).not.toBeNull();
      // "Bar" is 3 chars — offset 20 must be clamped to 3, not 20.
      expect(textSelection!.anchor).toBe(3);
      expect(textSelection!.head).toBe(3);
    }).pipe(runtime.runPromise);
  });
});
