import { schema } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeLive, NodeT } from "@/services/domain/Node";
import { TupleLive, TupleT } from "@/services/domain/Tuple";
import { TypeLive, TypeT } from "@/services/domain/Type";
import { AutomergeT, makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { BufferLive, BufferT } from "@/services/ui/Buffer";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import { ViewLive } from "@/services/ui/View";
import { WindowLive } from "@/services/ui/Window";
import * as Given from "@/test-utils/bdd/given";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Layer, ManagedRuntime, Option } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { beforeEach, describe, expect, it } from "vitest";
import { makeChatViewNavigation } from "../index";

/**
 * Tests for ViewNavigationT chat view createBlock.
 *
 * The chat createBlock method manages message creation within a chat node,
 * handling tuple creation, ordering via fractional indices, and auto-type
 * assignment for title-context insertions.
 */

// ================================ Internal ==================================

type TestRuntime = ManagedRuntime.ManagedRuntime<
  ViewNavigationT | NodeT | TupleT | TypeT | BufferT | AutomergeT | StoreT,
  never
>;

const ChatViewNavigationLive = Layer.effect(
  ViewNavigationT,
  makeChatViewNavigation,
);

const setupChatUnitTest = async () => {
  const storeId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const adapter = makeAdapter({ storage: { type: "in-memory" } });
  const liveStore = await createStorePromise({
    schema,
    adapter,
    storeId,
    disableDevtools: true,
  });

  const TestLayer = ChatViewNavigationLive.pipe(
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

/**
 * Creates a chat buffer: a root node (the chat node) with the buffer assigned to it.
 * Does NOT create any messages - tests add those explicitly.
 */
const A_CHAT_BUFFER = () =>
  Effect.gen(function* () {
    const { bufferId, rootNodeId, windowId } =
      yield* Given.A_BUFFER_WITH_CHILDREN("Chat", []);

    return { bufferId, chatNodeId: rootNodeId, windowId };
  });

/**
 * Creates a chat message as a child of the chat node with a CHAT_HAS_MESSAGE tuple.
 * Returns the message node ID.
 */
const A_CHAT_MESSAGE = (chatNodeId: Id.Node, fractionalIndex: string) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;

    const msgNodeId = yield* Node.insertNode({
      parentId: chatNodeId,
      insert: "after",
    });

    yield* Tuple.create(
      System.CHAT_HAS_MESSAGE,
      [chatNodeId, msgNodeId],
      ["", fractionalIndex],
    );

    return msgNodeId;
  });

/**
 * Assigns a role type to a message node.
 */
const MESSAGE_HAS_ROLE = (nodeId: Id.Node, roleTypeId: Id.Node) =>
  Effect.gen(function* () {
    const Type = yield* TypeT;
    yield* Type.addType(nodeId, roleTypeId);
  });

// ============================================================================

describe("ViewNavigation - chat createBlock", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupChatUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("creates a CHAT_HAS_MESSAGE tuple for the new node", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);

      const Nav = yield* ViewNavigationT;
      const newNodeId = yield* Nav.createBlock(m1, bufferId, "after");

      // Verify CHAT_HAS_MESSAGE tuple exists with chatNode at pos 0, newNode at pos 1
      const Tuple = yield* TupleT;
      const tuples = yield* Tuple.findByPosition(
        System.CHAT_HAS_MESSAGE,
        1,
        newNodeId,
      );

      expect(tuples).toHaveLength(1);
      expect(tuples[0]!.members[0]).toBe(chatNodeId);
      expect(tuples[0]!.members[1]).toBe(newNodeId);
    }).pipe(runtime.runPromise);
  });

  it("positions new message after the given message", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // Create two messages: M1, M2
      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      const m2 = yield* A_CHAT_MESSAGE(chatNodeId, idx2);

      const Nav = yield* ViewNavigationT;
      // Insert after M1 -> should land between M1 and M2
      const newNodeId = yield* Nav.createBlock(m1, bufferId, "after");

      // Get all messages sorted by position 1 fractional index
      const Tuple = yield* TupleT;
      const allTuples = yield* Tuple.findByPosition(
        System.CHAT_HAS_MESSAGE,
        0,
        chatNodeId,
        1,
      );

      const orderedNodeIds = allTuples.map((t) => t.members[1]);
      expect(orderedNodeIds).toEqual([m1, newNodeId, m2]);
    }).pipe(runtime.runPromise);
  });

  it("positions new message before the given message", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // Create two messages: M1, M2
      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      const m2 = yield* A_CHAT_MESSAGE(chatNodeId, idx2);

      const Nav = yield* ViewNavigationT;
      // Insert before M2 -> should land between M1 and M2
      const newNodeId = yield* Nav.createBlock(m2, bufferId, "before");

      // Get all messages sorted by position 1 fractional index
      const Tuple = yield* TupleT;
      const allTuples = yield* Tuple.findByPosition(
        System.CHAT_HAS_MESSAGE,
        0,
        chatNodeId,
        1,
      );

      const orderedNodeIds = allTuples.map((t) => t.members[1]);
      expect(orderedNodeIds).toEqual([m1, newNodeId, m2]);
    }).pipe(runtime.runPromise);
  });

  it("title context with no messages assigns msg:user type", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // No messages exist - createBlock on the root (title context)
      const Nav = yield* ViewNavigationT;
      const newNodeId = yield* Nav.createBlock(chatNodeId, bufferId, "after");

      // Verify the new node has MSG_USER type
      const Type = yield* TypeT;
      const types = yield* Type.getTypes(newNodeId);
      expect(types).toContain(System.MSG_USER);
    }).pipe(runtime.runPromise);
  });

  it("block context inherits sibling's role type", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // Create a message with msg:user role
      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      yield* MESSAGE_HAS_ROLE(m1, System.MSG_USER);

      // createBlock on a sibling (block context) - should inherit sibling's role
      const Nav = yield* ViewNavigationT;
      const newNodeId = yield* Nav.createBlock(m1, bufferId, "after");

      const Type = yield* TypeT;
      const types = yield* Type.getTypes(newNodeId);
      expect(types).toContain(System.MSG_USER);
    }).pipe(runtime.runPromise);
  });

  it("block context inherits msg:aengel role from sibling", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // Create a message with msg:aengel role
      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      yield* MESSAGE_HAS_ROLE(m1, System.MSG_AENGEL);

      const Nav = yield* ViewNavigationT;
      const newNodeId = yield* Nav.createBlock(m1, bufferId, "after");

      const Type = yield* TypeT;
      const types = yield* Type.getTypes(newNodeId);
      expect(types).toContain(System.MSG_AENGEL);
    }).pipe(runtime.runPromise);
  });

  it("block context with untyped sibling assigns no role type", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // Create a message with NO role type
      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);

      const Nav = yield* ViewNavigationT;
      const newNodeId = yield* Nav.createBlock(m1, bufferId, "after");

      const Type = yield* TypeT;
      const types = yield* Type.getTypes(newNodeId);
      const hasRole = types.some(
        (t) =>
          t === System.MSG_USER ||
          t === System.MSG_SYSTEM ||
          t === System.MSG_AENGEL,
      );
      expect(hasRole).toBe(false);
    }).pipe(runtime.runPromise);
  });

  it("title context with existing messages assigns first message's role type", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      // Create a message with msg:system role
      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      yield* MESSAGE_HAS_ROLE(m1, System.MSG_SYSTEM);

      // createBlock on the root (title context) - should prepend and
      // inherit the first message's role type
      const Nav = yield* ViewNavigationT;
      const newNodeId = yield* Nav.createBlock(chatNodeId, bufferId, "after");

      // Verify the new node gets MSG_SYSTEM type (same as first message)
      const Type = yield* TypeT;
      const types = yield* Type.getTypes(newNodeId);
      expect(types).toContain(System.MSG_SYSTEM);
    }).pipe(runtime.runPromise);
  });
});

describe("ViewNavigation - chat resolveBlockAbove", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupChatUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("returns the previous message in tuple order", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      const m2 = yield* A_CHAT_MESSAGE(chatNodeId, idx2);

      const Nav = yield* ViewNavigationT;
      const result = yield* Nav.resolveBlockAbove(m2, bufferId);

      expect(result).toEqual(Option.some(m1));
    }).pipe(runtime.runPromise);
  });

  it("returns None for the first message", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);

      const Nav = yield* ViewNavigationT;
      const result = yield* Nav.resolveBlockAbove(m1, bufferId);

      expect(result).toEqual(Option.none());
    }).pipe(runtime.runPromise);
  });

  it("returns None for an unknown nodeId", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      yield* A_CHAT_MESSAGE(chatNodeId, idx1);

      const Nav = yield* ViewNavigationT;
      const result = yield* Nav.resolveBlockAbove(
        Id.Node.make("unknown-node"),
        bufferId,
      );

      expect(result).toEqual(Option.none());
    }).pipe(runtime.runPromise);
  });
});

describe("ViewNavigation - chat resolveBlockBelow", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupChatUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("returns the next message in tuple order", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);
      const m2 = yield* A_CHAT_MESSAGE(chatNodeId, idx2);

      const Nav = yield* ViewNavigationT;
      const result = yield* Nav.resolveBlockBelow(m1, bufferId);

      expect(result).toEqual(Option.some(m2));
    }).pipe(runtime.runPromise);
  });

  it("returns None for the last message", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      const m1 = yield* A_CHAT_MESSAGE(chatNodeId, idx1);

      const Nav = yield* ViewNavigationT;
      const result = yield* Nav.resolveBlockBelow(m1, bufferId);

      expect(result).toEqual(Option.none());
    }).pipe(runtime.runPromise);
  });

  it("returns None for an unknown nodeId", async () => {
    await Effect.gen(function* () {
      const { bufferId, chatNodeId } = yield* A_CHAT_BUFFER();

      const idx1 = generateKeyBetween(null, null);
      yield* A_CHAT_MESSAGE(chatNodeId, idx1);

      const Nav = yield* ViewNavigationT;
      const result = yield* Nav.resolveBlockBelow(
        Id.Node.make("unknown-node"),
        bufferId,
      );

      expect(result).toEqual(Option.none());
    }).pipe(runtime.runPromise);
  });
});
