import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Shift+Up from in-block text selection", () => {
  it("enters block selection mode when focus offset is 0", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block containing text
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Focus the block
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      // Create in-block text selection with focus at offset 0
      // Selection from offset 5 to offset 0 (anchor=5, focus=0)
      yield* Given.BUFFER_HAS_SELECTION(
        bufferId,
        { nodeId: childNodeIds[0], offset: 5 },
        { nodeId: childNodeIds[0], offset: 0 },
      );

      // Verify the selection is set correctly in the model
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(5);
            expect(buf.selection?.focusOffset).toBe(0);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+Up
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Then: Buffer enters block selection mode with the current block selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });

  it("does NOT enter block selection mode when focus offset is not 0", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block containing text
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Focus the block
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      // Create in-block text selection with focus NOT at offset 0
      // Selection from offset 0 to offset 5 (anchor=0, focus=5)
      yield* Given.BUFFER_HAS_SELECTION(
        bufferId,
        { nodeId: childNodeIds[0], offset: 0 },
        { nodeId: childNodeIds[0], offset: 5 },
      );

      // Verify the selection is set correctly in the model
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(0);
            expect(buf.selection?.focusOffset).toBe(5);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+Up
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Then: Should NOT enter block selection mode (selectedBlocks should be empty)
      // The text selection should extend, but we stay in text editing mode
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

  it("enters block selection from collapsed cursor at offset 0", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block, cursor collapsed at offset 0
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      // Focus the block
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      // Set collapsed cursor at offset 0
      yield* Given.BUFFER_HAS_CURSOR(bufferId, childNodeIds[0], 0);

      // Verify the cursor is at offset 0
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(0);
            expect(buf.selection?.focusOffset).toBe(0);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+Up
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      // Then: Buffer enters block selection mode with the current block selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });
});
