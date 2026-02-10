import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeLive } from "@/services/domain/Node";
import { TupleLive, TupleT } from "@/services/domain/Tuple";
import { TypeLive, TypeT } from "@/services/domain/Type";
import { AutomergeT, makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { BlockLive, BlockT } from "@/services/ui/Block";
import { FrameLive } from "@/services/ui/Frame";
import { PickerLive } from "@/services/ui/Picker";
import { TypePickerLive } from "@/services/ui/TypePicker";
import { ViewLive } from "@/services/ui/View";
import { WorldLive } from "@/services/ui/World";
import * as Given from "@/test-utils/bdd/given";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { schema } from "@/livestore/schema";
import { Effect, Layer, ManagedRuntime, Option, Stream } from "effect";
import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it } from "vitest";

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

  const TestLayer = BlockLive.pipe(
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

const createViewNode = (
  pageNodeId: Id.Node,
  viewType: typeof System.TABLE_VIEW | typeof System.CHAT_VIEW,
  viewName: string,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    const viewNodeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: viewNodeId },
      }),
    );
    yield* Automerge.setText(viewNodeId, viewName);
    yield* Type.addType(viewNodeId, viewType);
    yield* Tuple.create(System.HAS_VIEW, [pageNodeId, viewNodeId]);

    return viewNodeId;
  });

// ============================================================================

describe("Block subscribe - view system", () => {
  let runtime: Awaited<ReturnType<typeof makeTestRuntime>>["runtime"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await makeTestRuntime();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("auto-detects table view when activeViewId is null", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      // Create a table view linked to the root node
      yield* createViewNode(rootNodeId, System.TABLE_VIEW, "Table View");

      // Subscribe to the block stream for the root's block
      const Block = yield* BlockT;
      const blockId = Id.makeFrameBlockId(frameId, rootNodeId);
      const stream = yield* Block.subscribe(blockId);
      const firstEmission = yield* Stream.runHead(stream);
      const view = Option.getOrThrow(firstEmission);

      expect(view.activeViewId).toBeNull();
      expect(view.activeViewType).toBe("table");
      expect(view.availableViews).toHaveLength(1);
      expect(view.availableViews[0]!.type).toBe("table");
    }).pipe(runtime.runPromise);
  });

  it("defaults to page when no typed views exist", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const Block = yield* BlockT;
      const blockId = Id.makeFrameBlockId(frameId, rootNodeId);
      const stream = yield* Block.subscribe(blockId);
      const firstEmission = yield* Stream.runHead(stream);
      const view = Option.getOrThrow(firstEmission);

      expect(view.activeViewId).toBeNull();
      expect(view.activeViewType).toBe("page");
      expect(view.availableViews).toHaveLength(0);
    }).pipe(runtime.runPromise);
  });

  it("explicit activeViewId overrides auto-detection", async () => {
    await Effect.gen(function* () {
      const Store = yield* StoreT;
      const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      // Create a table view (would be auto-detected)
      yield* createViewNode(rootNodeId, System.TABLE_VIEW, "Table View");

      // Create a second view node typed as chat
      const chatViewNodeId = yield* createViewNode(
        rootNodeId,
        System.CHAT_VIEW,
        "Chat View",
      );

      // Explicitly set activeViewId to the chat view via block document
      const blockId = Id.makeFrameBlockId(frameId, rootNodeId);
      yield* Store.setDocument(
        "block",
        {
          isExpanded: true,
          activeViewId: chatViewNodeId,
          ghostChildId: null,
          ghostParentId: null,
        },
        blockId,
      );

      const Block = yield* BlockT;
      const stream = yield* Block.subscribe(blockId);
      const firstEmission = yield* Stream.runHead(stream);
      const view = Option.getOrThrow(firstEmission);

      expect(view.activeViewId).toBe(chatViewNodeId);
      expect(view.activeViewType).toBe("chat");
      expect(view.availableViews).toHaveLength(2);
    }).pipe(runtime.runPromise);
  });
});
