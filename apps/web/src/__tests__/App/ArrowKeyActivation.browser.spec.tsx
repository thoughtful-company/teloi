import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import FrameView from "@/ui/FrameView";
import { Effect, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

/**
 * Arrow key frame activation tests.
 *
 * When nothing is focused (activeElement is None), pressing arrow keys should:
 * - ArrowDown: activate the frame and select the first block
 * - ArrowUp: activate the frame and select the last block
 * - If no blocks exist: just activate the frame without selection
 *
 * The logic is implemented in Frame.tsx - these tests verify the
 * integration works correctly when rendered.
 */
describe("Arrow key frame activation", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * Sets up the pane/window hierarchy so getActiveFrameId() works.
   * The Given.A_FRAME_WITH_CHILDREN helper creates a frame but doesn't
   * register the pane in the window, so we need to do that here.
   */
  const registerFrameInWindow = (frameId: Id.Frame, windowId: Id.Window) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const paneId = Id.Pane.make("test-pane");

      // Create pane document with the frame
      yield* Store.setDocument(
        "pane",
        {
          parent: { id: windowId, type: "window" },
          frames: [frameId],
        },
        paneId,
      );

      // Update window to include the pane
      yield* Store.setDocument(
        "window",
        {
          panes: [paneId],
        },
        windowId,
      );
    });

  /**
   * Ensures activeElement in the window document is None (nothing focused).
   */
  const ensureNothingFocused = () =>
    Effect.gen(function* () {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const Window = yield* WindowT;
      yield* Window.setActiveElement(Option.none());

      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      expect(Option.isNone(Option.getOrThrow(activeElement))).toBe(true);
    });

  /**
   * Dispatches a keydown event on document and waits for async handler.
   */
  const pressKeyOnDocument = (key: string) =>
    Effect.promise(async () => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      // Give async handler time to complete
      await new Promise((r) => setTimeout(r, 100));
    });

  it("ArrowDown activates frame and selects first block when nothing is focused", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Document Title", [
          { text: "First block" },
          { text: "Second block" },
          { text: "Third block" },
        ]);

      yield* registerFrameInWindow(frameId, windowId);
      render(() => <FrameView frameId={frameId} />);
      yield* Then.BLOCK_COUNT_IS(3);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowDown");

      // First block should be selected in khora selection mode
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });

      // activeElement should be the frame (khora selection mode)
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("frame");
      if (el.type === "frame") {
        expect(el.id).toBe(frameId);
      }
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp activates frame and selects last block when nothing is focused", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Document Title", [
          { text: "First block" },
          { text: "Second block" },
          { text: "Third block" },
        ]);

      yield* registerFrameInWindow(frameId, windowId);
      render(() => <FrameView frameId={frameId} />);
      yield* Then.BLOCK_COUNT_IS(3);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowUp");

      // Last block should be selected in khora selection mode
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [childNodeIds[2]], {
        anchor: childNodeIds[2],
        focus: childNodeIds[2],
      });

      // activeElement should be the frame (khora selection mode)
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("frame");
      if (el.type === "frame") {
        expect(el.id).toBe(frameId);
      }
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown activates frame without selection when frame has no blocks", async () => {
    await Effect.gen(function* () {
      const {
        frameId,
        nodeId: rootNodeId,
        windowId,
      } = yield* Given.A_FRAME_WITH_TEXT("Document Title");

      yield* registerFrameInWindow(frameId, windowId);
      render(() => <FrameView frameId={frameId} />);
      yield* Then.BLOCK_COUNT_IS(0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowDown");

      // No blocks selected (empty selection)
      yield* Then.BLOCKS_ARE_SELECTED(frameId, []);

      // activeElement should be the frame
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("frame");
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp activates frame without selection when frame has no blocks", async () => {
    await Effect.gen(function* () {
      const {
        frameId,
        nodeId: rootNodeId,
        windowId,
      } = yield* Given.A_FRAME_WITH_TEXT("Document Title");

      yield* registerFrameInWindow(frameId, windowId);
      render(() => <FrameView frameId={frameId} />);
      yield* Then.BLOCK_COUNT_IS(0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowUp");

      // No blocks selected (empty selection)
      yield* Then.BLOCKS_ARE_SELECTED(frameId, []);

      // activeElement should be the frame
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("frame");
    }).pipe(runtime.runPromise);
  });
});
