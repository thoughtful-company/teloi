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
            expect(buf.lastFocusedBlockId).toBe(childNodeIds[0]);
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
            expect(buf.lastFocusedBlockId).toBe(childNodeIds[0]); // Preserved!
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
});
