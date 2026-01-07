import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, When } from "../bdd";
import { waitFor } from "solid-testing-library";

describe("Block Escape key", () => {
  it("Escape in text editing mode selects the block", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block in text editing mode
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "Block content" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click block to enter text editing mode
      yield* When.USER_CLICKS_BLOCK(blockId);

      const Store = yield* StoreT;

      // Verify we're in text editing mode (activeElement.type = "block")
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("block");
          },
          { timeout: 2000 },
        ),
      );

      // Wait for CodeMirror to be mounted AND focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Escape
      yield* When.USER_PRESSES("{Escape}");

      // Then: activeElement = { type: "buffer" }, selectedBlocks = [nodeId]
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer");
            expect((activeEl as { type: "buffer"; id: string }).id).toBe(
              bufferId,
            );
          },
          { timeout: 2000 },
        ),
      );

      // Check selectedBlocks contains the node
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toContain(childNodeIds[0]);
            expect(buf.blockSelectionAnchor).toBe(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Escape when block selected clears selection but keeps buffer active", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block already selected (not in text editing mode)
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "Block content" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Enter text editing, then press Escape to select
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused before pressing Escape
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Escape}");

      // Verify we're in block selection mode
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer");
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Escape again
      yield* When.USER_PRESSES("{Escape}");

      // Then: buffer stays active, selectedBlocks cleared, lastFocusedBlockId preserved
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer"); // Buffer stays active for arrow restoration
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.lastFocusedBlockId).toBe(childNodeIds[0]); // Preserved for arrow restoration
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowLeft from nested block selects parent block", async () => {
    await Effect.gen(function* () {
      // Given: A nested structure
      // Root (buffer assigned)
      // └── Parent
      //       ├── A ← nested, selecting this and pressing ArrowLeft should select Parent
      //       ├── B
      //       └── C
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      // Add children A, B, C under Parent
      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "C",
      });

      const childABlockId = Id.makeBlockId(bufferId, childA);

      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Enter block selection mode with A selected
      yield* When.USER_ENTERS_BLOCK_SELECTION(childABlockId);

      // Verify A is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toContain(childA);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses ArrowLeft
      yield* When.USER_PRESSES("{ArrowLeft}");

      // Then: Parent becomes selected (nested A's parent)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([parentNodeId]);
            expect(buf.blockSelectionAnchor).toBe(parentNodeId);
            expect(buf.blockSelectionFocus).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );

      // Verify we're still in buffer mode (not text editing)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Escape from top-level block clears selection", async () => {
    await Effect.gen(function* () {
      // Given: Simple structure Root → [A, B, C], A is direct child of buffer root
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      const blockAId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Enter block selection mode with A selected
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockAId);

      // Verify A is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toContain(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Escape
      yield* When.USER_PRESSES("{Escape}");

      // Then: Selection is cleared (top-level block, so no parent to select)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            // Note: blockSelectionAnchor/Focus may be preserved for arrow key restoration
            // The key assertion is that selectedBlocks is empty
          },
          { timeout: 2000 },
        ),
      );

      // Verify buffer stays active (for arrow key restoration)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Enter after Escape places cursor at end of block, not at old selection position", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block, cursor positioned mid-text (simulating text selection)
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click block to enter text editing mode
      yield* When.USER_CLICKS_BLOCK(blockId);

      const Store = yield* StoreT;
      const Buffer = yield* BufferT;

      // Wait for CodeMirror to be mounted and focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      // Set selection mid-text (simulating user selecting text before pressing Escape)
      yield* Buffer.setSelection(
        bufferId,
        Option.some({
          anchor: { nodeId: childNodeIds[0] },
          anchorOffset: 2, // After "He"
          focus: { nodeId: childNodeIds[0] },
          focusOffset: 5, // After "Hello" - selecting "llo"
          goalX: null,
          goalLine: null,
          assoc: 0,
        }),
      );

      // When: User presses Escape to enter block selection
      yield* When.USER_PRESSES("{Escape}");

      // Wait for block selection mode
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer");
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Enter to exit block selection and return to text editing
      yield* When.USER_PRESSES("{Enter}");

      // Then: Cursor should be at END of block (position 11), not at old selection (position 2-5)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            // "Hello world" = 11 characters, cursor should be at end
            expect(buf.selection?.anchorOffset).toBe(11);
            expect(buf.selection?.focusOffset).toBe(11);
          },
          { timeout: 2000 },
        ),
      );

      // Verify we're back in text editing mode
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("block");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
