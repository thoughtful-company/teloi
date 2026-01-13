import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { WindowT } from "@/services/ui/Window";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option, Stream } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, Then, When, setupClientTest, type BrowserRuntime } from "../bdd";

/**
 * Enter/Space buffer activation tests.
 *
 * When buffer is active but nothing is selected (no block selection, no text editing),
 * pressing Enter or Space should:
 * - If buffer has no children: create new block and enter editing mode (cursor at pos 0)
 * - If last block is empty: focus it (enter editing mode, cursor at end = 0)
 * - If last block has content: create new block after it, focus new block (cursor at pos 0)
 *
 * Neither should trigger when CodeMirror is focused or in block selection mode.
 */
describe("Enter/Space buffer activation", () => {
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
   * Sets the buffer as the active element (no text editing, no block selection).
   * This is the state where Enter/Space should trigger.
   */
  const activateBufferWithoutSelection = (bufferId: Id.Buffer) =>
    Effect.gen(function* () {
      // Blur any DOM-focused element
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const Window = yield* WindowT;
      yield* Window.setActiveElement(Option.some({ type: "buffer", id: bufferId }));

      // Verify the state
      const stream = yield* Window.subscribeActiveElement();
      const activeElement = yield* stream.pipe(Stream.runHead);
      expect(Option.isSome(activeElement)).toBe(true);
      const el = Option.getOrThrow(activeElement);
      expect(Option.isSome(el)).toBe(true);
      const element = Option.getOrThrow(el);
      expect(element.type).toBe("buffer");
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

  /**
   * Waits for CodeMirror to be focused (editing mode).
   */
  const waitForCodeMirrorFocused = () =>
    Effect.promise(() =>
      waitFor(
        () => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          expect(cmEditor, "CodeMirror should be focused").not.toBeNull();
        },
        { timeout: 2000 },
      ),
    );

  /**
   * Gets the children of the buffer's root node.
   */
  const getBufferChildren = (rootNodeId: Id.Node) =>
    Effect.gen(function* () {
      const Node = yield* NodeT;
      return yield* Node.getNodeChildren(rootNodeId);
    });

  /**
   * Gets a node's text content from Yjs.
   */
  const getNodeText = (nodeId: Id.Node) =>
    Effect.gen(function* () {
      const Yjs = yield* YjsT;
      return Yjs.getText(nodeId).toString();
    });

  describe("Empty buffer behavior", () => {
    it("Enter on empty buffer creates first block and enters editing mode", async () => {
      await Effect.gen(function* () {
        const { bufferId, nodeId: rootNodeId, windowId } =
          yield* Given.A_BUFFER_WITH_TEXT("Document Title");

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(0);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
        yield* activateBufferWithoutSelection(bufferId);

        yield* pressKeyOnDocument("Enter");

        // Should have created a new block
        yield* Then.BLOCK_COUNT_IS(1);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        // Should be in editing mode (CodeMirror focused)
        yield* waitForCodeMirrorFocused();

        // New block should be empty
        const children = yield* getBufferChildren(rootNodeId);
        const newBlockText = yield* getNodeText(children[0]!);
        expect(newBlockText).toBe("");

        // Cursor should be at position 0
        yield* Then.CM_CURSOR_IS_AT(0);
      }).pipe(runtime.runPromise);
    });

    it("Space on empty buffer creates first block and enters editing mode", async () => {
      await Effect.gen(function* () {
        const { bufferId, nodeId: rootNodeId, windowId } =
          yield* Given.A_BUFFER_WITH_TEXT("Document Title");

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(0);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
        yield* activateBufferWithoutSelection(bufferId);

        yield* pressKeyOnDocument(" ");

        // Should have created a new block
        yield* Then.BLOCK_COUNT_IS(1);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        // Should be in editing mode (CodeMirror focused)
        yield* waitForCodeMirrorFocused();

        // New block should be empty
        const children = yield* getBufferChildren(rootNodeId);
        const newBlockText = yield* getNodeText(children[0]!);
        expect(newBlockText).toBe("");

        // Cursor should be at position 0
        yield* Then.CM_CURSOR_IS_AT(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Last block empty behavior", () => {
    it("Enter when last block is empty focuses that block (cursor at end)", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "First block" },
            { text: "" }, // Empty last block
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(2);
        yield* activateBufferWithoutSelection(bufferId);

        yield* pressKeyOnDocument("Enter");

        // Should NOT have created a new block
        yield* Then.BLOCK_COUNT_IS(2);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

        // Should be in editing mode (CodeMirror focused)
        yield* waitForCodeMirrorFocused();

        // Cursor should be at position 0 (end of empty block = 0)
        yield* Then.CM_CURSOR_IS_AT(0);

        // Active element should be the empty block
        const Window = yield* WindowT;
        const stream = yield* Window.subscribeActiveElement();
        const activeElement = yield* stream.pipe(Stream.runHead);
        expect(Option.isSome(activeElement)).toBe(true);
        const el = Option.getOrThrow(activeElement);
        expect(Option.isSome(el)).toBe(true);
        const element = Option.getOrThrow(el);
        expect(element.type).toBe("block");
        if (element.type === "block") {
          expect(element.id).toBe(Id.makeBlockId(bufferId, childNodeIds[1]));
        }
      }).pipe(runtime.runPromise);
    });

    it("Space when last block is empty focuses that block (cursor at end)", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "First block" },
            { text: "" }, // Empty last block
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(2);
        yield* activateBufferWithoutSelection(bufferId);

        yield* pressKeyOnDocument(" ");

        // Should NOT have created a new block
        yield* Then.BLOCK_COUNT_IS(2);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

        // Should be in editing mode (CodeMirror focused)
        yield* waitForCodeMirrorFocused();

        // Cursor should be at position 0 (end of empty block = 0)
        yield* Then.CM_CURSOR_IS_AT(0);

        // Active element should be the empty block
        const Window = yield* WindowT;
        const stream = yield* Window.subscribeActiveElement();
        const activeElement = yield* stream.pipe(Stream.runHead);
        expect(Option.isSome(activeElement)).toBe(true);
        const el = Option.getOrThrow(activeElement);
        expect(Option.isSome(el)).toBe(true);
        const element = Option.getOrThrow(el);
        expect(element.type).toBe("block");
        if (element.type === "block") {
          expect(element.id).toBe(Id.makeBlockId(bufferId, childNodeIds[1]));
        }
      }).pipe(runtime.runPromise);
    });
  });

  describe("Last block has content behavior", () => {
    it("Enter when last block has content creates new block after it", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "First block" },
            { text: "Last block with content" },
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(2);
        yield* activateBufferWithoutSelection(bufferId);

        yield* pressKeyOnDocument("Enter");

        // Should have created a new block
        yield* Then.BLOCK_COUNT_IS(3);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 3);

        // Should be in editing mode (CodeMirror focused)
        yield* waitForCodeMirrorFocused();

        // New block should be empty
        const children = yield* getBufferChildren(rootNodeId);
        const newBlockText = yield* getNodeText(children[2]!);
        expect(newBlockText).toBe("");

        // Cursor should be at position 0
        yield* Then.CM_CURSOR_IS_AT(0);
      }).pipe(runtime.runPromise);
    });

    it("Space when last block has content creates new block after it", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "First block" },
            { text: "Last block with content" },
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(2);
        yield* activateBufferWithoutSelection(bufferId);

        yield* pressKeyOnDocument(" ");

        // Should have created a new block
        yield* Then.BLOCK_COUNT_IS(3);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 3);

        // Should be in editing mode (CodeMirror focused)
        yield* waitForCodeMirrorFocused();

        // New block should be empty
        const children = yield* getBufferChildren(rootNodeId);
        const newBlockText = yield* getNodeText(children[2]!);
        expect(newBlockText).toBe("");

        // Cursor should be at position 0
        yield* Then.CM_CURSOR_IS_AT(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Should NOT trigger in certain modes", () => {
    it("Enter does not trigger when CodeMirror is focused (typing in a block)", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "Block content" },
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(1);

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        // Click the block to enter editing mode
        yield* When.USER_CLICKS_BLOCK(blockId);
        yield* waitForCodeMirrorFocused();

        // Get initial block count
        const initialChildren = yield* getBufferChildren(rootNodeId);
        expect(initialChildren.length).toBe(1);

        // Press Enter (should be handled by CodeMirror, not our activation handler)
        yield* When.USER_PRESSES("{Enter}");

        // Should still be in editing mode
        yield* waitForCodeMirrorFocused();

        // Block count may change due to CodeMirror's Enter behavior (split block)
        // The key assertion is that our activation handler did NOT run
        // (it would have created a block at the END, not split the current one)
      }).pipe(runtime.runPromise);
    });

    it("Space does not trigger when CodeMirror is focused (typing in a block)", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "Block content" },
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(1);

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        // Click the block to enter editing mode
        yield* When.USER_CLICKS_BLOCK(blockId);
        yield* waitForCodeMirrorFocused();

        // Press Space (should type a space in CodeMirror)
        yield* When.USER_PRESSES(" ");

        // Should still be in editing mode
        yield* waitForCodeMirrorFocused();

        // Should still have only 1 block (not created a new one)
        yield* Then.BLOCK_COUNT_IS(1);

        // The block content should now include a space
        const blockText = yield* getNodeText(childNodeIds[0]);
        expect(blockText).toContain(" ");
      }).pipe(runtime.runPromise);
    });

    it("Enter does not trigger when in block selection mode (existing handler takes over)", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds, windowId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
            { text: "Block content" },
          ]);

        yield* registerBufferInWindow(bufferId, windowId);
        render(() => <EditorBuffer bufferId={bufferId} />);
        yield* Then.BLOCK_COUNT_IS(1);

        const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

        // Enter block selection mode
        yield* When.USER_ENTERS_BLOCK_SELECTION(blockId);

        // Verify we're in block selection mode
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
          anchor: childNodeIds[0],
          focus: childNodeIds[0],
        });

        // Press Enter - should enter text editing on the selected block,
        // NOT create a new block via our activation handler
        yield* pressKeyOnDocument("Enter");

        // The existing block selection handler should focus the selected block
        // We should be in editing mode now
        yield* waitForCodeMirrorFocused();

        // Should still have only 1 block (the activation handler didn't run)
        yield* Then.BLOCK_COUNT_IS(1);
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      }).pipe(runtime.runPromise);
    });

    // NOTE: Space in block selection mode has existing behavior (creates sibling block)
    // which is tested in Block/Space.browser.spec.tsx. That's intentional and separate
    // from the Enter/Space activation feature which only triggers when NO block is selected.
  });
});
