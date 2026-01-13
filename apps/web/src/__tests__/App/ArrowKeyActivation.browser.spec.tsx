import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, Then, setupClientTest, type BrowserRuntime } from "../bdd";

/**
 * Arrow key buffer activation tests.
 *
 * When nothing is focused (activeElement is None), pressing arrow keys should:
 * - ArrowDown: activate the buffer and select the first block
 * - ArrowUp: activate the buffer and select the last block
 * - If no blocks exist: just activate the buffer without selection
 *
 * The logic is implemented in EditorBuffer.tsx - these tests verify the
 * integration works correctly when rendered.
 */
describe("Arrow key buffer activation", () => {
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
   * Sets up the pane/window hierarchy so getActiveBufferId() works.
   * The Given.A_BUFFER_WITH_CHILDREN helper creates a buffer but doesn't
   * register the pane in the window, so we need to do that here.
   */
  const registerBufferInWindow = (bufferId: Id.Buffer, windowId: Id.Window) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const paneId = Id.Pane.make("test-pane");

      // Create pane document with the buffer
      yield* Store.setDocument(
        "pane",
        {
          parent: { id: windowId, type: "window" },
          buffers: [bufferId],
        },
        paneId,
      );

      // Update window to include the pane
      yield* Store.setDocument(
        "window",
        {
          panes: [paneId],
          activeElement: null,
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

  it("ArrowDown activates buffer and selects first block when nothing is focused", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
          { text: "Second block" },
          { text: "Third block" },
        ]);

      yield* registerBufferInWindow(bufferId, windowId);
      render(() => <EditorBuffer bufferId={bufferId} />);
      yield* Then.BLOCK_COUNT_IS(3);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowDown");

      // First block should be selected in block selection mode
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });

      // activeElement should be the buffer (block selection mode)
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("buffer");
      if (el.type === "buffer") {
        expect(el.id).toBe(bufferId);
      }
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp activates buffer and selects last block when nothing is focused", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
          { text: "Second block" },
          { text: "Third block" },
        ]);

      yield* registerBufferInWindow(bufferId, windowId);
      render(() => <EditorBuffer bufferId={bufferId} />);
      yield* Then.BLOCK_COUNT_IS(3);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowUp");

      // Last block should be selected in block selection mode
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]], {
        anchor: childNodeIds[2],
        focus: childNodeIds[2],
      });

      // activeElement should be the buffer (block selection mode)
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("buffer");
      if (el.type === "buffer") {
        expect(el.id).toBe(bufferId);
      }
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown activates buffer without selection when buffer has no blocks", async () => {
    await Effect.gen(function* () {
      const { bufferId, nodeId: rootNodeId, windowId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      yield* registerBufferInWindow(bufferId, windowId);
      render(() => <EditorBuffer bufferId={bufferId} />);
      yield* Then.BLOCK_COUNT_IS(0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowDown");

      // No blocks selected (empty selection)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, []);

      // activeElement should be the buffer
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("buffer");
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp activates buffer without selection when buffer has no blocks", async () => {
    await Effect.gen(function* () {
      const { bufferId, nodeId: rootNodeId, windowId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      yield* registerBufferInWindow(bufferId, windowId);
      render(() => <EditorBuffer bufferId={bufferId} />);
      yield* Then.BLOCK_COUNT_IS(0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
      yield* ensureNothingFocused();

      yield* pressKeyOnDocument("ArrowUp");

      // No blocks selected (empty selection)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, []);

      // activeElement should be the buffer
      const Window = yield* WindowT;
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const element = Option.getOrThrow(activeElement);
      expect(Option.isSome(element)).toBe(true);
      const el = Option.getOrThrow(element);
      expect(el.type).toBe("buffer");
    }).pipe(runtime.runPromise);
  });
});
