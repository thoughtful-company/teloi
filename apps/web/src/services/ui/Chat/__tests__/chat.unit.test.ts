import { schema } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeLive, NodeT } from "@/services/domain/Node";
import { TupleLive, TupleT } from "@/services/domain/Tuple";
import { TypeLive, TypeT } from "@/services/domain/Type";
import { AutomergeT, makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { BufferLive, BufferT } from "@/services/ui/Buffer";
import { ChatLive, ChatT, type ChatMessageEntry } from "@/services/ui/Chat";
import { ViewLive } from "@/services/ui/View";
import { WindowLive } from "@/services/ui/Window";
import * as Given from "@/test-utils/bdd/given";
import { validateMessages } from "@/ui/chat/validateMessages";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Fiber, Layer, ManagedRuntime, Stream } from "effect";
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

describe("Chat.getMessages", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("returns messages sorted by fractional index with correct role and content", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* A_CHAT_BUFFER();
      const Automerge = yield* AutomergeT;

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      // Insert in reverse order to verify sorting by fractional index
      const m2 = yield* A_CHAT_MESSAGE(chatNodeId, idx2, System.MSG_USER);
      yield* Automerge.setText(m2, "Hello, world!");

      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_SYSTEM);
      yield* Automerge.setText(m1, "You are a helpful assistant.");

      const Chat = yield* ChatT;
      const messages = yield* Chat.getMessages(chatNodeId);

      expect(messages).toHaveLength(2);
      expect(messages[0]!.nodeId).toBe(m1);
      expect(messages[0]!.role).toBe("system");
      expect(messages[0]!.content).toBe("You are a helpful assistant.");
      expect(messages[1]!.nodeId).toBe(m2);
      expect(messages[1]!.role).toBe("user");
      expect(messages[1]!.content).toBe("Hello, world!");
    }).pipe(runtime.runPromise);
  });

  it("filters out messages without a recognized role type", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* A_CHAT_BUFFER();
      const Node = yield* NodeT;
      const Tuple = yield* TupleT;

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      // Message with a role type
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_USER);

      // Message without a role type (just node + tuple, no type)
      const noRoleNode = yield* Node.insertNode({
        parentId: chatNodeId,
        insert: "after",
      });
      yield* Tuple.create(
        System.CHAT_HAS_MESSAGE,
        [chatNodeId, noRoleNode],
        ["", idx2],
      );

      const Chat = yield* ChatT;
      const messages = yield* Chat.getMessages(chatNodeId);

      expect(messages).toHaveLength(1);
      expect(messages[0]!.nodeId).toBe(m1);
      expect(messages[0]!.role).toBe("user");
    }).pipe(runtime.runPromise);
  });
});

describe("Chat.subscribeMessages", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
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
});

describe("validateMessages", () => {
  const msg = (
    role: ChatMessageEntry["role"],
    id = "node-1",
  ): ChatMessageEntry => ({
    nodeId: id as Id.Node,
    role,
  });

  it("marks no wrong place for a valid conversation", () => {
    const result = validateMessages([
      msg("system", "n1"),
      msg("user", "n2"),
      msg("assistant", "n3"),
    ]);
    expect(result.every((m) => m.wrongPlace === null)).toBe(true);
  });

  it("flags system message after non-system as system-not-first", () => {
    const result = validateMessages([msg("user", "n1"), msg("system", "n2")]);
    expect(result[0]!.wrongPlace).toBe(null);
    expect(result[1]!.wrongPlace).toBe("system-not-first");
  });

  it("flags assistant before any user message as aengel-before-user", () => {
    const result = validateMessages([
      msg("system", "n1"),
      msg("assistant", "n2"),
    ]);
    expect(result[0]!.wrongPlace).toBe(null);
    expect(result[1]!.wrongPlace).toBe("aengel-before-user");
  });

  it("flags assistant as aengel-before-user even without system prefix", () => {
    const result = validateMessages([msg("assistant", "n1")]);
    expect(result[0]!.wrongPlace).toBe("aengel-before-user");
  });

  it("does not flag consecutive same-role messages", () => {
    const result = validateMessages([msg("user", "n1"), msg("user", "n2")]);
    expect(result.every((m) => m.wrongPlace === null)).toBe(true);
  });
});
