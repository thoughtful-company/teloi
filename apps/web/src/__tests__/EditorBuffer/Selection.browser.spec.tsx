import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block selection", () => {
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
    vi.restoreAllMocks();
    await cleanup();
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
            // Check for ring class on a descendant (visual indicator moved to inner content div)
            const ringEl = blockEl?.querySelector('[class*="ring-"]');
            expect(ringEl).not.toBeNull();
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
            // Check for ring class on a descendant (visual indicator moved to inner content div)
            expect(firstBlockEl?.querySelector('[class*="ring-"]')).not.toBeNull();
            expect(secondBlockEl?.querySelector('[class*="ring-"]')).not.toBeNull();
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
            // Check for ring class on a descendant (visual indicator moved to inner content div)
            expect(firstBlockEl?.querySelector('[class*="ring-"]')).not.toBeNull();
            expect(secondBlockEl?.querySelector('[class*="ring-"]')).not.toBeNull();
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

      // Then: Selection collapses to single block (B - topmost of selection)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(1);
            expect(buf.selectedBlocks).toEqual([childNodeIds[1]]); // B (topmost)
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

      // Then: Selection collapses to single block (C - bottommost of selection)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toHaveLength(1);
            expect(buf.selectedBlocks).toEqual([childNodeIds[2]]); // C (bottommost)
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
            // Ring class should be gone from the inner content div
            expect(firstBlockEl?.querySelector('[class*="ring-"]')).toBeNull();
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

  it("Delete removes selected blocks and stays in selection mode", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with three blocks, middle one is selected
      const { bufferId, childNodeIds, windowId } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First" },
          { text: "Second" },
          { text: "Third" },
        ]);

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

      // When: User presses Delete
      yield* When.USER_PRESSES("{Delete}");

      // Then: Second block should be deleted, only First and Third remain
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const children = document.querySelectorAll(
              '[data-testid="editor-body"] [data-element-type="block"]',
            );
            expect(children).toHaveLength(2);
          },
          { timeout: 2000 },
        ),
      );

      // Verify the remaining blocks are First and Third (Second was deleted)
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const firstBlock = document.querySelector(
              `[data-element-id="${Id.makeBlockId(bufferId, childNodeIds[0])}"]`,
            );
            const thirdBlock = document.querySelector(
              `[data-element-id="${Id.makeBlockId(bufferId, childNodeIds[2])}"]`,
            );
            const secondBlock = document.querySelector(
              `[data-element-id="${secondBlockId}"]`,
            );
            expect(firstBlock).not.toBeNull();
            expect(thirdBlock).not.toBeNull();
            expect(secondBlock).toBeNull(); // Deleted!
          },
          { timeout: 2000 },
        ),
      );

      // Verify we stay in block selection mode with First block selected
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("buffer"); // Still in selection mode!
          },
          { timeout: 2000 },
        ),
      );

      // Verify First block is now selected (block before the deleted one)
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([childNodeIds[0]]); // First block
            expect(buf.blockSelectionAnchor).toBe(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("clicking title clears block selection", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Block content" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Click block and press Escape to select it
      yield* When.USER_CLICKS_BLOCK(blockId);

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

      // Verify block is selected
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

      // When: User clicks the title
      yield* When.USER_CLICKS_TITLE(bufferId);

      // Then: selectedBlocks should be cleared but anchor preserved
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

  it("ArrowUp on first block scrolls to top of buffer", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      // Enter block selection mode on the first block
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Find the scroll container
      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      // Simulate that user has scrolled down (title not visible)
      let currentScrollTop = 100;
      const scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      // Mock container rect
      vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 500,
        left: 0,
        right: 800,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      // Mock the first block as being visible but with title above viewport
      const firstBlockEl = document.querySelector(
        `[data-element-id="${firstBlockId}"]`,
      );
      vi.spyOn(
        firstBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 150, // Block is visible
        bottom: 180,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 150,
        toJSON: () => ({}),
      });

      // When: User presses ArrowUp (while on first block)
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: Still on the first block (no previous block to go to)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Wait for potential scroll animation
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      // And: scrollTop should have been set to scroll up toward 0
      expect(scrollTopSetter).toHaveBeenCalled();
      expect(currentScrollTop).toBeLessThan(100);
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown after Escape restores to last focused block, not next block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "Block A" },
          { text: "Block B" },
          { text: "Block C" },
          { text: "Block D" },
        ],
      );

      const [nodeA, nodeB, nodeC] = childNodeIds;
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;
      const Buffer = yield* BufferT;
      const Window = yield* WindowT;

      // Set up block selection: A (anchor) -> B -> C (focus)
      yield* Buffer.setBlockSelection(
        bufferId,
        [nodeA, nodeB, nodeC],
        nodeA,
        nodeC,
      );
      yield* Window.setActiveElement(
        Option.some({ type: "buffer" as const, id: bufferId }),
      );

      // Verify initial state: 3 blocks selected with focus on C
      yield* Effect.promise(() =>
        waitFor(async () => {
          const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
            runtime.runPromise,
          );
          expect(Option.isSome(bufferDoc)).toBe(true);
          const buf = Option.getOrThrow(bufferDoc);
          expect(buf.selectedBlocks).toEqual([nodeA, nodeB, nodeC]);
          expect(buf.blockSelectionFocus).toBe(nodeC);
        }),
      );

      // When: User presses Escape to clear selection
      yield* When.USER_PRESSES("{Escape}");

      // Verify selection cleared but lastFocusedBlockId preserved
      yield* Effect.promise(() =>
        waitFor(async () => {
          const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
            runtime.runPromise,
          );
          expect(Option.isSome(bufferDoc)).toBe(true);
          const buf = Option.getOrThrow(bufferDoc);
          expect(buf.selectedBlocks).toEqual([]);
          expect(buf.lastFocusedBlockId).toBe(nodeC);
        }),
      );

      // When: User presses ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Selection should be restored to C (last focused), NOT D (next block)
      yield* Effect.promise(() =>
        waitFor(async () => {
          const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
            runtime.runPromise,
          );
          expect(Option.isSome(bufferDoc)).toBe(true);
          const buf = Option.getOrThrow(bufferDoc);
          expect(buf.selectedBlocks).toEqual([nodeC]);
          expect(buf.blockSelectionFocus).toBe(nodeC);
        }),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp after Escape restores to last focused block, not previous block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "Block A" },
          { text: "Block B" },
          { text: "Block C" },
          { text: "Block D" },
        ],
      );

      const [nodeA, nodeB, nodeC] = childNodeIds;
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;
      const Buffer = yield* BufferT;
      const Window = yield* WindowT;

      // Set up block selection: A (anchor) -> B -> C (focus)
      yield* Buffer.setBlockSelection(
        bufferId,
        [nodeA, nodeB, nodeC],
        nodeA,
        nodeC,
      );
      yield* Window.setActiveElement(
        Option.some({ type: "buffer" as const, id: bufferId }),
      );

      // Verify initial state
      yield* Effect.promise(() =>
        waitFor(async () => {
          const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
            runtime.runPromise,
          );
          expect(Option.isSome(bufferDoc)).toBe(true);
          const buf = Option.getOrThrow(bufferDoc);
          expect(buf.selectedBlocks).toEqual([nodeA, nodeB, nodeC]);
          expect(buf.blockSelectionFocus).toBe(nodeC);
        }),
      );

      // When: User presses Escape to clear selection
      yield* When.USER_PRESSES("{Escape}");

      // Verify selection cleared
      yield* Effect.promise(() =>
        waitFor(async () => {
          const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
            runtime.runPromise,
          );
          expect(Option.isSome(bufferDoc)).toBe(true);
          const buf = Option.getOrThrow(bufferDoc);
          expect(buf.selectedBlocks).toEqual([]);
          expect(buf.lastFocusedBlockId).toBe(nodeC);
        }),
      );

      // When: User presses ArrowUp
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: Selection should be restored to C (last focused), NOT B (previous block)
      yield* Effect.promise(() =>
        waitFor(async () => {
          const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
            runtime.runPromise,
          );
          expect(Option.isSome(bufferDoc)).toBe(true);
          const buf = Option.getOrThrow(bufferDoc);
          expect(buf.selectedBlocks).toEqual([nodeC]);
          expect(buf.blockSelectionFocus).toBe(nodeC);
        }),
      );
    }).pipe(runtime.runPromise);
  });

  // TODO: Cmd+Up/Down now collapse/expand blocks. Re-implement as long-press gesture.
  it.skip("Cmd+Up jumps to first sibling (skipping intermediate blocks)", async () => {
    await Effect.gen(function* () {
      // Given: 5 blocks A, B, C, D, E - C is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "A" },
          { text: "B" },
          { text: "C" },
          { text: "D" },
          { text: "E" },
        ],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on C
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockC);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]]);

      // When: User presses Cmd+Up (Meta+ArrowUp)
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: A becomes selected (first sibling, not B - proves it jumped)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });

  // TODO: Cmd+Up/Down now collapse/expand blocks. Re-implement as long-press gesture.
  it.skip("Cmd+Down jumps to last sibling (skipping intermediate blocks)", async () => {
    await Effect.gen(function* () {
      // Given: 5 blocks A, B, C, D, E - C is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "A" },
          { text: "B" },
          { text: "C" },
          { text: "D" },
          { text: "E" },
        ],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on C
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockC);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]]);

      // When: User presses Cmd+Down (Meta+ArrowDown)
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: E becomes selected (last sibling, not D - proves it jumped)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[4]], {
        anchor: childNodeIds[4],
        focus: childNodeIds[4],
      });
    }).pipe(runtime.runPromise);
  });

  // TODO: Cmd+Up/Down now collapse/expand blocks. Re-implement as long-press gesture.
  it.skip("Shift+Cmd+Up extends selection from anchor to first sibling", async () => {
    await Effect.gen(function* () {
      // Given: 5 blocks A, B, C, D, E - C is selected (anchor=C)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "A" },
          { text: "B" },
          { text: "C" },
          { text: "D" },
          { text: "E" },
        ],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on C
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockC);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]], {
        anchor: childNodeIds[2],
        focus: childNodeIds[2],
      });

      // When: User presses Shift+Cmd+Up
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: A, B, C selected with anchor=C, focus=A
      yield* Then.BLOCKS_ARE_SELECTED(
        bufferId,
        [childNodeIds[0], childNodeIds[1], childNodeIds[2]],
        {
          anchor: childNodeIds[2],
          focus: childNodeIds[0],
        },
      );
    }).pipe(runtime.runPromise);
  });

  // TODO: Cmd+Up/Down now collapse/expand blocks. Re-implement as long-press gesture.
  it.skip("Shift+Cmd+Down extends selection from anchor to last sibling", async () => {
    await Effect.gen(function* () {
      // Given: 5 blocks A, B, C, D, E - C is selected (anchor=C)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "A" },
          { text: "B" },
          { text: "C" },
          { text: "D" },
          { text: "E" },
        ],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on C
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockC);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]], {
        anchor: childNodeIds[2],
        focus: childNodeIds[2],
      });

      // When: User presses Shift+Cmd+Down
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowDown}{/Meta}{/Shift}");

      // Then: C, D, E selected with anchor=C, focus=E
      yield* Then.BLOCKS_ARE_SELECTED(
        bufferId,
        [childNodeIds[2], childNodeIds[3], childNodeIds[4]],
        {
          anchor: childNodeIds[2],
          focus: childNodeIds[4],
        },
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown navigates among children of a nested parent block", async () => {
    await Effect.gen(function* () {
      // Given: Root with one child (Parent), Parent has children A, B, C
      // Structure:
      //   Root (buffer assigned)
      //     └── Parent (top-level block)
      //           ├── A
      //           ├── B
      //           └── C
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];

      // Create A, B, C as children of Parent
      const nodeA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        siblingId: nodeA,
        text: "B",
      });
      const nodeC = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        siblingId: nodeB,
        text: "C",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select A (first child of Parent, which is at 2nd indentation level)
      const blockA = Id.makeBlockId(bufferId, nodeA);
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA]);

      // When: Press ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Selection moves to B
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeB]);

      // Press ArrowDown again - moves to C
      yield* When.USER_PRESSES("{ArrowDown}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeC]);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+A selects all blocks", async () => {
    await Effect.gen(function* () {
      // Given: 5 blocks A, B, C, D, E - C is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "A" },
          { text: "B" },
          { text: "C" },
          { text: "D" },
          { text: "E" },
        ],
      );

      const blockC = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on C
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockC);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]]);

      // When: User presses Cmd+A
      yield* When.USER_PRESSES("{Meta>}a{/Meta}");

      // Then: All blocks selected with anchor=first, focus=last
      yield* Then.BLOCKS_ARE_SELECTED(
        bufferId,
        [
          childNodeIds[0],
          childNodeIds[1],
          childNodeIds[2],
          childNodeIds[3],
          childNodeIds[4],
        ],
        {
          anchor: childNodeIds[0],
          focus: childNodeIds[4],
        },
      );
    }).pipe(runtime.runPromise);
  });

  describe("block selection with empty selection and no lastFocusedBlockId", () => {
    it("ArrowDown selects the first block when there are blocks", async () => {
      await Effect.gen(function* () {
        // Given: A buffer with 3 blocks
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }, { text: "Third" }],
        );

        render(() => <EditorBuffer bufferId={bufferId} />);

        const Store = yield* StoreT;
        const Window = yield* WindowT;

        // Set up block selection mode (activeElement.type = "buffer")
        // but with empty selection and no lastFocusedBlockId
        yield* Window.setActiveElement(
          Option.some({ type: "buffer" as const, id: bufferId }),
        );

        // Verify we're in block selection mode with empty selection
        yield* Effect.promise(() =>
          waitFor(async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.lastFocusedBlockId).toBeNull();
          }),
        );

        // When: User presses ArrowDown
        yield* When.USER_PRESSES("{ArrowDown}");

        // Then: First block should be selected
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
          anchor: childNodeIds[0],
          focus: childNodeIds[0],
        });
      }).pipe(runtime.runPromise);
    });

    it("ArrowUp selects the last block when there are blocks", async () => {
      await Effect.gen(function* () {
        // Given: A buffer with 3 blocks
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }, { text: "Third" }],
        );

        render(() => <EditorBuffer bufferId={bufferId} />);

        const Store = yield* StoreT;
        const Window = yield* WindowT;

        // Set up block selection mode (activeElement.type = "buffer")
        // but with empty selection and no lastFocusedBlockId
        yield* Window.setActiveElement(
          Option.some({ type: "buffer" as const, id: bufferId }),
        );

        // Verify we're in block selection mode with empty selection
        yield* Effect.promise(() =>
          waitFor(async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.lastFocusedBlockId).toBeNull();
          }),
        );

        // When: User presses ArrowUp
        yield* When.USER_PRESSES("{ArrowUp}");

        // Then: Last block should be selected
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]], {
          anchor: childNodeIds[2],
          focus: childNodeIds[2],
        });
      }).pipe(runtime.runPromise);
    });

    it("ArrowDown does nothing when there are no blocks", async () => {
      await Effect.gen(function* () {
        // Given: A buffer with no child blocks (only root)
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Root", []);

        render(() => <EditorBuffer bufferId={bufferId} />);

        const Store = yield* StoreT;
        const Window = yield* WindowT;

        // Set up block selection mode with empty selection
        yield* Window.setActiveElement(
          Option.some({ type: "buffer" as const, id: bufferId }),
        );

        // Verify we're in block selection mode with empty selection
        yield* Effect.promise(() =>
          waitFor(async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.lastFocusedBlockId).toBeNull();
          }),
        );

        // When: User presses ArrowDown
        yield* When.USER_PRESSES("{ArrowDown}");

        // Then: Selection should still be empty (nothing happened)
        yield* Effect.promise(() =>
          waitFor(async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.blockSelectionAnchor).toBeNull();
          }),
        );
      }).pipe(runtime.runPromise);
    });

    it("ArrowUp does nothing when there are no blocks", async () => {
      await Effect.gen(function* () {
        // Given: A buffer with no child blocks (only root)
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Root", []);

        render(() => <EditorBuffer bufferId={bufferId} />);

        const Store = yield* StoreT;
        const Window = yield* WindowT;

        // Set up block selection mode with empty selection
        yield* Window.setActiveElement(
          Option.some({ type: "buffer" as const, id: bufferId }),
        );

        // Verify we're in block selection mode with empty selection
        yield* Effect.promise(() =>
          waitFor(async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.lastFocusedBlockId).toBeNull();
          }),
        );

        // When: User presses ArrowUp
        yield* When.USER_PRESSES("{ArrowUp}");

        // Then: Selection should still be empty (nothing happened)
        yield* Effect.promise(() =>
          waitFor(async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
            expect(buf.blockSelectionAnchor).toBeNull();
          }),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
