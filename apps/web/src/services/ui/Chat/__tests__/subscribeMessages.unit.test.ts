import { schema } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeLive, NodeT } from "@/services/domain/Node";
import { TupleLive, TupleT } from "@/services/domain/Tuple";
import { TypeLive, TypeT } from "@/services/domain/Type";
import { AutomergeT, makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { BufferLive, BufferT } from "@/services/ui/Buffer";
import { ChatLive, ChatT } from "@/services/ui/Chat";
import { ViewLive } from "@/services/ui/View";
import { WindowLive } from "@/services/ui/Window";
import * as Given from "@/test-utils/bdd/given";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Fiber, Layer, ManagedRuntime, Option, Stream } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { beforeEach, describe, expect, it } from "vitest";

// ================================ Internal ==================================

type TestRuntime = ManagedRuntime.ManagedRuntime<
  ChatT | NodeT | TupleT | TypeT | BufferT | AutomergeT | StoreT,
  never
>;

const setupTest = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const TestLayer = ChatLive.pipe(
    Layer.provideMerge(BufferLive),
    Layer.provideMerge(ViewLive),
    Layer.provideMerge(TupleLive),
    Layer.provideMerge(TypeLive),
    Layer.provideMerge(WindowLive),
    Layer.provideMerge(NodeLive),
    Layer.provideMerge(
      makeAutomergeLive({ workspaceName: storeId, persist: false }),
    ),
    Layer.provideMerge(getStoreLayer(liveStore)),
  );

  const runtime = ManagedRuntime.make(TestLayer);

  return {
    runtime: runtime as TestRuntime,
    cleanup: async () => {
      await runtime.dispose();
      await liveStore.shutdown();
    },
  };
};

const A_CHAT_BUFFER = () =>
  Effect.gen(function* () {
    const { bufferId, rootNodeId, windowId } =
      yield* Given.A_BUFFER_WITH_CHILDREN("Chat", []);

    return { bufferId, chatNodeId: rootNodeId, windowId };
  });

const A_CHAT_MESSAGE = (
  chatNodeId: Id.Node,
  fractionalIndex: string,
  roleTypeId: Id.Node,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;

    const msgNodeId = yield* Node.insertNode({
      parentId: chatNodeId,
      insert: "after",
    });

    yield* Tuple.create(
      System.CHAT_HAS_MESSAGE,
      [chatNodeId, msgNodeId],
      ["", fractionalIndex],
    );

    yield* Type.addType(msgNodeId, roleTypeId);

    return msgNodeId;
  });

// ============================================================================

describe("Chat.subscribeMessages", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("emits current messages on initial subscription", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* A_CHAT_BUFFER();
      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_USER);

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      // Take the first emission
      const messages = yield* Stream.runHead(stream);
      expect(Option.isSome(messages)).toBe(true);

      const list = Option.getOrThrow(messages);
      expect(list).toHaveLength(1);
      expect(list[0]!.nodeId).toBe(m1);
      expect(list[0]!.role).toBe("user");
    }).pipe(runtime.runPromise);
  });

  it("emits updated list when a new message tuple is created", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* A_CHAT_BUFFER();

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      // Collect emissions into an array via a fiber
      const collected: Array<
        readonly { nodeId: Id.Node; role: "system" | "user" | "assistant" }[]
      > = [];
      const fiber = yield* Stream.runForEach(stream, (msgs) =>
        Effect.sync(() => {
          collected.push(msgs);
        }),
      ).pipe(Effect.fork);

      // Wait for initial emission (empty chat)
      yield* Effect.sleep("50 millis");
      expect(collected.length).toBeGreaterThanOrEqual(1);
      expect(collected[0]).toHaveLength(0);

      // Add a message
      const idx1 = generateKeyBetween(null, null);
      yield* A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_USER);

      // Wait for re-emission
      yield* Effect.sleep("50 millis");
      const lastEmission = collected[collected.length - 1]!;
      expect(lastEmission).toHaveLength(1);
      expect(lastEmission[0]!.role).toBe("user");

      yield* Fiber.interrupt(fiber);
    }).pipe(runtime.runPromise);
  });

  it("returns messages sorted by fractional index", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* A_CHAT_BUFFER();
      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_SYSTEM);
      const m2 = yield* A_CHAT_MESSAGE(chatNodeId, idx2, System.MSG_USER);

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      const messages = yield* Stream.runHead(stream);
      const list = Option.getOrThrow(messages);
      expect(list).toHaveLength(2);
      expect(list[0]!.nodeId).toBe(m1);
      expect(list[0]!.role).toBe("system");
      expect(list[1]!.nodeId).toBe(m2);
      expect(list[1]!.role).toBe("user");
    }).pipe(runtime.runPromise);
  });

  it("skips messages without a recognized role type", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* A_CHAT_BUFFER();
      const Node = yield* NodeT;
      const Tuple = yield* TupleT;

      // Create a message with a role type
      const idx1 = generateKeyBetween(null, null);
      yield* A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_USER);

      // Create a message WITHOUT a role type (just node + tuple, no type)
      const noRoleNode = yield* Node.insertNode({
        parentId: chatNodeId,
        insert: "after",
      });
      const idx2 = generateKeyBetween(idx1, null);
      yield* Tuple.create(
        System.CHAT_HAS_MESSAGE,
        [chatNodeId, noRoleNode],
        ["", idx2],
      );

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      const messages = yield* Stream.runHead(stream);
      const list = Option.getOrThrow(messages);
      // Only the message with a recognized role should appear
      expect(list).toHaveLength(1);
      expect(list[0]!.role).toBe("user");
    }).pipe(runtime.runPromise);
  });
});
