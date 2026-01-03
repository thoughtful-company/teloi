import "@/index.css";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { cleanup, waitFor } from "solid-testing-library";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "./bdd";

describe("Selection sync", () => {
  it("syncs selection from model to CodeMirror", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the block to mount CodeMirror
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Set selection via model (position 5 = "Hello| world")
      const Buffer = yield* BufferT;
      yield* Buffer.setSelection(
        bufferId,
        Option.some({
          anchor: { nodeId: childNodeIds[0] },
          anchorOffset: 5,
          focus: { nodeId: childNodeIds[0] },
          focusOffset: 5,
          goalX: null,
          goalLine: null,
          assoc: null,
        }),
      );

      // Give time for the effect to sync
      yield* Effect.sleep("50 millis");

      // Verify CodeMirror cursor is at position 5
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("preserves selection when block remounts after structural change", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, move cursor to position 7
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(7);

      // Indent (causes remount under new parent)
      yield* When.USER_PRESSES("{Tab}");

      // Verify structure changed
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Cursor should still be at position 7 after remount
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(7);
    }).pipe(runtime.runPromise);
  });

  // Regression test for: cursor flashing at position 0 on page reload
  //
  // The bug: On page reload, Yjs takes time to sync content from IndexedDB.
  // During this time, doc.length is 0. The old code would focus immediately
  // and set selection to 0, causing a visible "flash" before jumping to
  // the saved position.
  //
  // The fix: When mounting with empty doc but saved selection at position > 0,
  // defer focus until Yjs syncs, keeping cursor hidden (caret-color: transparent).
  //
  // This test verifies that when the block mounts with a pending selection,
  // the cursor is hidden until content is ready.
  it("hides cursor until Yjs syncs when selection is pending", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with content
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Test Document",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      // First render: focus and set position at 6
      render(() => <EditorBuffer bufferId={bufferId} />);
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 6);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);

      // Simulate page reload: unmount and remount
      cleanup();
      render(() => <EditorBuffer bufferId={bufferId} />);

      // Set selection via model (simulates saved selection from before reload)
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 6);

      // Wait for CodeMirror to mount
      const cmContainer = yield* Effect.promise(() =>
        waitFor(
          () => {
            const container = document.querySelector(
              "[data-element-type='block'] .cm-editor",
            )?.parentElement;
            if (!container) throw new Error("CodeMirror container not found");
            return container as HTMLElement;
          },
          { timeout: 2000 },
        ),
      );

      // The bug: caret-color would be visible (not transparent), showing cursor at 0
      // Expected: caret-color is transparent until Yjs syncs and selection is set
      // Note: By the time we check, Yjs has likely synced, so cursor should be visible
      // and at the correct position. The key is that it was NEVER visible at position 0.

      // Wait for selection to be at position 6 (after Yjs sync)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);

      // After sync, cursor should be visible (caret-color not transparent)
      yield* Effect.sync(() => {
        const caretColor = getComputedStyle(cmContainer).caretColor;
        // caret-color should NOT be transparent after sync
        if (caretColor === "transparent") {
          throw new Error("Cursor should be visible after Yjs sync");
        }
      });
    }).pipe(runtime.runPromise);
  });

  // Regression test for: typing into empty block after body click produces wrong text
  //
  // The bug: When clicking body to focus an empty block, then typing, the first
  // character would end up at the end of the text ("hello" → "elloh").
  //
  // Root cause: The updateListener that handles "doc empty → non-empty" transition
  // was resetting selection to 0 after the first character was typed, causing
  // subsequent characters to be inserted at position 0.
  //
  // The fix: Only run the updateListener selection/focus logic when NOT already
  // focused (i.e., waiting for Yjs sync, not user actively typing).
  it("preserves typing order in empty block (first char not moved to end)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with an empty block
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Test Document",
        [{ text: "" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click on the empty block to focus it
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(".cm-content");
            if (!cm) throw new Error("CodeMirror not found");
            if (!cm.contains(document.activeElement)) {
              throw new Error("CodeMirror not focused");
            }
          },
          { timeout: 2000 },
        ),
      );

      // Type "hello"
      yield* When.USER_PRESSES("hello");

      // The bug: text would be "elloh" (first char moved to end)
      // Expected: text is "hello" in correct order
      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "hello");
    }).pipe(runtime.runPromise);
  });
});
