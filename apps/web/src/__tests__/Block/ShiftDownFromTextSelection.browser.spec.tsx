import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Shift+Down from in-block text selection", () => {
  it("enters block selection mode when focus offset is at document length", async () => {
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

      // Create in-block text selection with focus at document length (end of text)
      // "Hello world" has length 11, so focus at offset 11
      // Selection from offset 5 to offset 11 (anchor=5, focus=11)
      yield* Given.BUFFER_HAS_SELECTION(
        bufferId,
        { nodeId: childNodeIds[0], offset: 5 },
        { nodeId: childNodeIds[0], offset: 11 },
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
            expect(buf.selection?.focusOffset).toBe(11);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+Down
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Then: Buffer enters block selection mode with the current block selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });

  it("does NOT enter block selection mode when focus offset is not at document length", async () => {
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

      // Create in-block text selection with focus NOT at document length
      // Selection from offset 11 to offset 5 (anchor=11, focus=5)
      yield* Given.BUFFER_HAS_SELECTION(
        bufferId,
        { nodeId: childNodeIds[0], offset: 11 },
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
            expect(buf.selection?.anchorOffset).toBe(11);
            expect(buf.selection?.focusOffset).toBe(5);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+Down
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

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

  it("enters block selection from collapsed cursor at document length", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block, cursor collapsed at document length (end of text)
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

      // Set collapsed cursor at document length (end of text, offset 11)
      yield* Given.BUFFER_HAS_CURSOR(bufferId, childNodeIds[0], 11);

      // Verify the cursor is at document length
      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(11);
            expect(buf.selection?.focusOffset).toBe(11);
          },
          { timeout: 2000 },
        ),
      );

      // When: User presses Shift+Down
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Then: Buffer enters block selection mode with the current block selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });
});
