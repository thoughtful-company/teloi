import { schema } from "@/livestore/schema";
import { NodeLive, NodeT } from "@/services/domain/Node";
import { TupleLive } from "@/services/domain/Tuple";
import { TypeLive } from "@/services/domain/Type";
import { AutomergeT, makeAutomergeLive } from "@/services/external/Automerge";
import { getStoreLayer, StoreT } from "@/services/external/Store";
import { KeyboardT } from "@/services/browser/Keyboard";
import { FrameLive, FrameT } from "@/services/ui/Frame";
import { WindowLive } from "@/services/ui/Window";
import {
  KeyEventBusLive,
  KeyEventBusT,
  type KeyEvent,
} from "@/services/ui/KeyEventBus";
import { CommandBusT, type Command } from "@/services/ui/CommandBus";
import * as Given from "@/test-utils/bdd/given";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

// ================================ Internal ==================================

/** Collected dispatched commands for assertion. */
let dispatched: Command[] = [];

/** CommandBus that records dispatched commands instead of executing them. */
const RecordingCommandBusLive = Layer.succeed(CommandBusT, {
  dispatch: (command: Command) =>
    Effect.sync(() => {
      dispatched.push(command);
    }),
});

/** Stub KeyboardT - emit() doesn't use it, only runAppKeyboardHandler does. */
const StubKeyboardLive = Layer.succeed(KeyboardT, {
  keydowns: () => Effect.succeed(Stream.empty),
});

type TestRuntime = ManagedRuntime.ManagedRuntime<
  KeyEventBusT | FrameT | StoreT | AutomergeT | NodeT,
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

  const TestLayer = KeyEventBusLive.pipe(
    Layer.provideMerge(RecordingCommandBusLive),
    Layer.provideMerge(StubKeyboardLive),
    Layer.provideMerge(FrameLive),
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

const NO_MODIFIERS = { meta: false, ctrl: false, alt: false, shift: false };

const makeAppKeyEvent = (
  key: string,
  modifiers?: Partial<KeyEvent["modifiers"]>,
): KeyEvent => ({
  key,
  modifiers: { ...NO_MODIFIERS, ...modifiers },
  source: { type: "app" },
});

// ============================================================================

describe("KeyEventBus — blockSelection keymap", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    dispatched = [];
    await cleanup?.();
    const setup = await setupTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  it("dispatches EditBlock on Enter", async () => {
    await Effect.gen(function* () {
      const { frameId } = yield* Given.A_FRAME_WITH_TEXT("hello");
      const Frame = yield* FrameT;
      yield* Frame.enterBlockSelection(frameId);

      const KeyEventBus = yield* KeyEventBusT;
      const handled = yield* KeyEventBus.emit(makeAppKeyEvent("Enter"));

      expect(handled).toBe(true);
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]!._tag).toBe("frame:editBlock");
    }).pipe(runtime.runPromise);
  });

  it("dispatches Indent on Tab", async () => {
    await Effect.gen(function* () {
      const { frameId } = yield* Given.A_FRAME_WITH_TEXT("hello");
      const Frame = yield* FrameT;
      yield* Frame.enterBlockSelection(frameId);

      const KeyEventBus = yield* KeyEventBusT;
      const handled = yield* KeyEventBus.emit(makeAppKeyEvent("Tab"));

      expect(handled).toBe(true);
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]!._tag).toBe("frame:indent");
    }).pipe(runtime.runPromise);
  });

  it("dispatches Outdent on Shift+Tab", async () => {
    await Effect.gen(function* () {
      const { frameId } = yield* Given.A_FRAME_WITH_TEXT("hello");
      const Frame = yield* FrameT;
      yield* Frame.enterBlockSelection(frameId);

      const KeyEventBus = yield* KeyEventBusT;
      const handled = yield* KeyEventBus.emit(
        makeAppKeyEvent("Tab", { shift: true }),
      );

      expect(handled).toBe(true);
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]!._tag).toBe("frame:outdent");
    }).pipe(runtime.runPromise);
  });
});
