import { schema } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeLive, NodeT } from "@/services/domain/Node";
import { TupleLive, TupleT } from "@/services/domain/Tuple";
import { TypeLive, TypeT } from "@/services/domain/Type";
import { AutomergeT, makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { BlockLive } from "@/services/ui/Block";
import { FrameLive, FrameT } from "@/services/ui/Frame";
import { PickerLive } from "@/services/ui/Picker";
import { TypePickerLive } from "@/services/ui/TypePicker";
import { ChatProviderT } from "@/services/external/ChatProvider";
import { ChatLive, ChatT, type ChatMessageEntry } from "@/services/ui/Chat";
import { ViewLive } from "@/services/ui/View";
import { WindowLive } from "@/services/ui/Window";
import * as Given from "@/test-utils/bdd/given";
import { validateMessages } from "@/ui/chat/validateMessages";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Fiber, Layer, ManagedRuntime, Schedule, Stream } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { beforeEach, describe, expect, it } from "vitest";

// ================================ Internal ==================================

const pollSchedule = Schedule.spaced("10 millis").pipe(
  Schedule.upTo("2 seconds"),
);

const pollUntil = (condition: () => void) =>
  Effect.try({ try: condition, catch: (e) => e as Error }).pipe(
    Effect.retry(pollSchedule),
  );

type TestRuntime = ManagedRuntime.ManagedRuntime<
  ChatT | NodeT | TupleT | TypeT | FrameT | AutomergeT | StoreT,
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

  const TestChatProviderLive = Layer.succeed(ChatProviderT, {
    send: () => Effect.succeed("[test response]"),
  });

  // Layer order: lower provides to higher; Picker needs Frame, Block needs Picker
  const TestLayer = ChatLive.pipe(
    Layer.provideMerge(ViewLive),
    Layer.provideMerge(BlockLive),
    Layer.provideMerge(PickerLive),
    Layer.provideMerge(TypePickerLive),
    Layer.provideMerge(FrameLive),
    Layer.provideMerge(TestChatProviderLive),
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
      const { chatNodeId } = yield* Given.A_CHAT_FRAME();
      const Automerge = yield* AutomergeT;

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      // Insert in reverse order to verify sorting by fractional index
      const m2 = yield* Given.A_CHAT_MESSAGE(chatNodeId, idx2, System.MSG_USER);
      yield* Automerge.setText(m2, "Hello, world!");

      const m1 = yield* Given.A_CHAT_MESSAGE(
        chatNodeId,
        idx1,
        System.MSG_SYSTEM,
      );
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

  it("includes untyped messages with inherited role from previous message", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* Given.A_CHAT_FRAME();

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      const m1 = yield* Given.A_CHAT_MESSAGE(
        chatNodeId,
        idx1,
        System.MSG_AENGEL,
      );
      const m2 = yield* Given.AN_UNTYPED_CHAT_MESSAGE(chatNodeId, idx2);

      const Chat = yield* ChatT;
      const messages = yield* Chat.getMessages(chatNodeId);

      expect(messages).toHaveLength(2);
      expect(messages[0]!.nodeId).toBe(m1);
      expect(messages[0]!.role).toBe("assistant");
      expect(messages[1]!.nodeId).toBe(m2);
      expect(messages[1]!.role).toBe("assistant");
    }).pipe(runtime.runPromise);
  });

  it("defaults untyped first message to user", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* Given.A_CHAT_FRAME();

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      const m1 = yield* Given.AN_UNTYPED_CHAT_MESSAGE(chatNodeId, idx1);
      const m2 = yield* Given.A_CHAT_MESSAGE(
        chatNodeId,
        idx2,
        System.MSG_AENGEL,
      );

      const Chat = yield* ChatT;
      const messages = yield* Chat.getMessages(chatNodeId);

      expect(messages).toHaveLength(2);
      expect(messages[0]!.nodeId).toBe(m1);
      expect(messages[0]!.role).toBe("user");
      expect(messages[1]!.nodeId).toBe(m2);
      expect(messages[1]!.role).toBe("assistant");
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
      const { chatNodeId } = yield* Given.A_CHAT_FRAME();

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      const collected: Array<
        readonly { nodeId: Id.Node; role: "system" | "user" | "assistant" }[]
      > = [];
      const fiber = yield* Stream.runForEach(stream, (msgs) =>
        Effect.sync(() => {
          collected.push(msgs);
        }),
      ).pipe(Effect.fork);

      yield* pollUntil(() => {
        expect(collected.length).toBeGreaterThanOrEqual(1);
        expect(collected[0]).toHaveLength(0);
      });

      const idx1 = generateKeyBetween(null, null);
      yield* Given.A_CHAT_MESSAGE(chatNodeId, idx1, System.MSG_USER);

      yield* pollUntil(() => {
        const last = collected[collected.length - 1]!;
        expect(last).toHaveLength(1);
        expect(last[0]!.role).toBe("user");
      });

      yield* Fiber.interrupt(fiber);
    }).pipe(runtime.runPromise);
  });

  it("emits when a message's type is added", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* Given.A_CHAT_FRAME();
      const Type = yield* TypeT;

      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* Given.AN_UNTYPED_CHAT_MESSAGE(chatNodeId, idx1);

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      const collected: Array<readonly ChatMessageEntry[]> = [];
      const fiber = yield* Stream.runForEach(stream, (msgs) =>
        Effect.sync(() => {
          collected.push(msgs);
        }),
      ).pipe(Effect.fork);

      yield* pollUntil(() => {
        expect(collected.length).toBeGreaterThanOrEqual(1);
        const initial = collected[collected.length - 1]!;
        expect(initial).toHaveLength(1);
        expect(initial[0]!.role).toBe("user");
      });

      const prevLength = collected.length;
      yield* Type.addType(m1, System.MSG_AENGEL);

      yield* pollUntil(() => {
        expect(collected.length).toBeGreaterThan(prevLength);
        const updated = collected[collected.length - 1]!;
        expect(updated).toHaveLength(1);
        expect(updated[0]!.role).toBe("assistant");
      });

      yield* Fiber.interrupt(fiber);
    }).pipe(runtime.runPromise);
  });

  it("emits when a message's type is removed", async () => {
    await Effect.gen(function* () {
      const { chatNodeId } = yield* Given.A_CHAT_FRAME();
      const Type = yield* TypeT;

      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* Given.A_CHAT_MESSAGE(
        chatNodeId,
        idx1,
        System.MSG_AENGEL,
      );

      const Chat = yield* ChatT;
      const stream = yield* Chat.subscribeMessages(chatNodeId);

      const collected: Array<readonly ChatMessageEntry[]> = [];
      const fiber = yield* Stream.runForEach(stream, (msgs) =>
        Effect.sync(() => {
          collected.push(msgs);
        }),
      ).pipe(Effect.fork);

      yield* pollUntil(() => {
        expect(collected.length).toBeGreaterThanOrEqual(1);
        const initial = collected[collected.length - 1]!;
        expect(initial[0]!.role).toBe("assistant");
      });

      // Falls back to inherited role ("user" default) when type is removed
      const prevLength = collected.length;
      yield* Type.removeType(m1, System.MSG_AENGEL);

      yield* pollUntil(() => {
        expect(collected.length).toBeGreaterThan(prevLength);
        const updated = collected[collected.length - 1]!;
        expect(updated).toHaveLength(1);
        expect(updated[0]!.role).toBe("user");
      });

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
