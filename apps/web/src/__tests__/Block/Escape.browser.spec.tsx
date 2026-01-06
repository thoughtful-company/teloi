import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, When } from "../bdd";
import { waitFor } from "solid-testing-library";

describe("Block selection via Escape", () => {
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

  it("Escape when block selected blurs completely", async () => {
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

      // Then: activeElement = null, selectedBlocks = [], lastFocusedBlockId preserved
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl).toBeNull();
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
            expect(buf.blockSelectionAnchor).toBe(childNodeIds[0]); // Preserved!
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("selected block shows visual indicator", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Block content" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

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

      // Then: Block element has selection ring/background
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${blockId}"]`,
            );
            expect(blockEl).not.toBeNull();
            // Check for ring class (visual indicator)
            expect(blockEl?.className).toMatch(/ring/);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Shift+ArrowUp extends selection to block above", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with two blocks, second one is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click second block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(secondBlockId);

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

      // Verify second block is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toEqual([
              childNodeIds[1],
            ]);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+ArrowUp
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Then: Both blocks are selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toContain(childNodeIds[0]);
            expect(buf.selectedBlocks).toContain(childNodeIds[1]);
            expect(buf.selectedBlocks).toHaveLength(2);
          },
          { timeout: 2000 },
        ),
      );

      // Both blocks should have visual indicator
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const firstBlockEl = document.querySelector(
              `[data-element-id="${firstBlockId}"]`,
            );
            const secondBlockEl = document.querySelector(
              `[data-element-id="${secondBlockId}"]`,
            );
            expect(firstBlockEl?.className).toMatch(/ring/);
            expect(secondBlockEl?.className).toMatch(/ring/);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Shift+ArrowUp then Shift+ArrowDown returns to single selection", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with three blocks, middle one is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }],
      );

      const blockB = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click block B and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(blockB);

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

      // Verify B is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toEqual([
              childNodeIds[1],
            ]);
          },
          { timeout: 2000 },
        ),
      );

      // Press Shift+ArrowUp - now A and B should be selected
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(2);
            expect(buf.selectedBlocks).toContain(childNodeIds[0]); // A
            expect(buf.selectedBlocks).toContain(childNodeIds[1]); // B
          },
          { timeout: 2000 },
        ),
      );

      // Press Shift+ArrowDown - should return to just B selected
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([childNodeIds[1]]); // Only B
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Shift+ArrowDown extends selection to block below", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with two blocks, first one is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click first block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(firstBlockId);

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

      // Verify first block is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toEqual([
              childNodeIds[0],
            ]);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+ArrowDown
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Then: Both blocks are selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toContain(childNodeIds[0]);
            expect(buf.selectedBlocks).toContain(childNodeIds[1]);
            expect(buf.selectedBlocks).toHaveLength(2);
          },
          { timeout: 2000 },
        ),
      );

      // Both blocks should have visual indicator
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const firstBlockEl = document.querySelector(
              `[data-element-id="${firstBlockId}"]`,
            );
            const secondBlockEl = document.querySelector(
              `[data-element-id="${secondBlockId}"]`,
            );
            expect(firstBlockEl?.className).toMatch(/ring/);
            expect(secondBlockEl?.className).toMatch(/ring/);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp moves focus to block above (single block selection)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with two blocks, second one is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click second block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(secondBlockId);

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

      // Verify second block is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toEqual([
              childNodeIds[1],
            ]);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses plain ArrowUp
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: First block is selected (single block), not both
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([childNodeIds[0]]);
            expect(buf.selectedBlocks).toHaveLength(1);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown moves focus to block below (single block selection)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with two blocks, first one is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click first block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(firstBlockId);

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

      // Verify first block is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toEqual([
              childNodeIds[0],
            ]);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses plain ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Second block is selected (single block), not both
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([childNodeIds[1]]);
            expect(buf.selectedBlocks).toHaveLength(1);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Shift+ArrowUp contracts 3-block selection to 2 blocks", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 4 blocks, B, C, D are selected (anchor=B, focus=D)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
      );

      const blockB = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click block B and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(blockB);

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

      // Extend selection down to D (2 Shift+ArrowDowns: B→C→D)
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify B, C, D are selected (3 blocks)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(3);
            expect(buf.selectedBlocks).toContain(childNodeIds[1]); // B
            expect(buf.selectedBlocks).toContain(childNodeIds[2]); // C
            expect(buf.selectedBlocks).toContain(childNodeIds[3]); // D
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+ArrowUp
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Then: Selection contracts to 2 blocks (B and C)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(2);
            expect(buf.selectedBlocks).toContain(childNodeIds[1]); // B
            expect(buf.selectedBlocks).toContain(childNodeIds[2]); // C
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp collapses 3-block selection to single block", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 4 blocks, B, C, D are selected (anchor=B, focus=D)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
      );

      const blockB = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click block B and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(blockB);

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

      // Extend selection down to D (2 Shift+ArrowDowns: B→C→D)
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify B, C, D are selected (3 blocks)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(3);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses plain ArrowUp (no Shift)
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: Selection collapses to single block (C - one above focus D)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(1);
            expect(buf.selectedBlocks).toEqual([childNodeIds[2]]); // C
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Shift+ArrowDown contracts 3-block selection to 2 blocks", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 4 blocks, A, B, C are selected (anchor=C, focus=A)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click block C and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(blockC);

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

      // Extend selection up to A (2 Shift+ArrowUps: C→B→A)
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Verify A, B, C are selected (3 blocks)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(3);
            expect(buf.selectedBlocks).toContain(childNodeIds[0]); // A
            expect(buf.selectedBlocks).toContain(childNodeIds[1]); // B
            expect(buf.selectedBlocks).toContain(childNodeIds[2]); // C
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+ArrowDown
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Then: Selection contracts to 2 blocks (B and C)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(2);
            expect(buf.selectedBlocks).toContain(childNodeIds[1]); // B
            expect(buf.selectedBlocks).toContain(childNodeIds[2]); // C
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown collapses 3-block selection to single block", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 4 blocks, A, B, C are selected (anchor=C, focus=A)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click block C and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(blockC);

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

      // Extend selection up to A (2 Shift+ArrowUps: C→B→A)
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Verify A, B, C are selected (3 blocks)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(3);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses plain ArrowDown (no Shift)
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Selection collapses to single block (B - one below focus A)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(1);
            expect(buf.selectedBlocks).toEqual([childNodeIds[1]]); // B
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("clicking another block clears selection", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with two blocks, first one is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click first block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(firstBlockId);

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

      // Verify first block is selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toContain(
              childNodeIds[0],
            );
          },
          { timeout: 2000 },
        ),
      );

      // When: User clicks second block to edit it
      yield* When.USER_CLICKS_BLOCK(secondBlockId);

      // Then: Selection is cleared, first block no longer has ring
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const firstBlockEl = document.querySelector(
              `[data-element-id="${firstBlockId}"]`,
            );
            expect(firstBlockEl).not.toBeNull();
            // Ring class should be gone
            expect(firstBlockEl?.className).not.toMatch(/ring/);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Enter starts editing focused block from end", async () => {
    await Effect.gen(function* () {
      // Given: Two blocks, navigate to second one
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First" },
          { text: "Second block" },
        ]);

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click first block and press Escape to enter block selection mode
      yield* When.USER_CLICKS_BLOCK(firstBlockId);

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

      // Verify we're in block selection mode on first block
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            expect(Option.getOrThrow(bufferDoc).selectedBlocks).toEqual([
              childNodeIds[0],
            ]);
          },
          { timeout: 2000 },
        ),
      );

      // Navigate down to second block
      yield* When.USER_PRESSES("{ArrowDown}");

      // Verify second block is now selected AND lastFocusedBlockId updated
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([childNodeIds[1]]);
            expect(buf.blockSelectionAnchor).toBe(childNodeIds[1]);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Enter
      yield* When.USER_PRESSES("{Enter}");

      // Then: activeElement = second block
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("block");
            expect((activeEl as { type: "block"; id: string }).id).toBe(
              secondBlockId,
            );
          },
          { timeout: 2000 },
        ),
      );

      // Cursor at end of second block's text ("Second block" = 12 chars)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection).not.toBeNull();
            expect(buf.selection?.anchor.nodeId).toBe(childNodeIds[1]);
            expect(buf.selection?.anchorOffset).toBe(12);
            expect(buf.selection?.focus.nodeId).toBe(childNodeIds[1]);
            expect(buf.selection?.focusOffset).toBe(12);
          },
          { timeout: 2000 },
        ),
      );

      // Block selection should be cleared
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Enter with multi-block selection edits focus block (not anchor)", async () => {
    await Effect.gen(function* () {
      // Given: Three blocks, all selected (anchor = first, focus = third)
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "Alpha" },
          { text: "Beta" },
          { text: "Gamma" },
        ]);

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const thirdBlockId = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click first block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(firstBlockId);

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

      // Extend selection to include all three blocks (anchor stays first, focus moves to third)
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify all three blocks are selected, anchor = first, focus = third
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(3);
            expect(buf.blockSelectionAnchor).toBe(childNodeIds[0]); // First block is anchor
            expect(buf.blockSelectionFocus).toBe(childNodeIds[2]); // Third block is focus
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Enter
      yield* When.USER_PRESSES("{Enter}");

      // Then: activeElement = THIRD block (the focus, not anchor!)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("block");
            expect((activeEl as { type: "block"; id: string }).id).toBe(
              thirdBlockId,
            );
          },
          { timeout: 2000 },
        ),
      );

      // Cursor at end of THIRD block's text ("Gamma" = 5 chars)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection).not.toBeNull();
            expect(buf.selection?.anchor.nodeId).toBe(childNodeIds[2]);
            expect(buf.selection?.anchorOffset).toBe(5);
          },
          { timeout: 2000 },
        ),
      );

      // All block selection should be cleared
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
