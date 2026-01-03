import "@/index.css";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option, Stream } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, When } from "../bdd";

describe("Window blur preserves selection", () => {
  // BUG: When window loses focus (alt-tab, tab switch), selection is cleared.
  // Selection should only be cleared when user clicks elsewhere in the document.

  it("preserves selection when window loses focus (alt-tab)", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks on the block to focus it
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${blockId}"]`,
            );
            const cm = blockEl?.querySelector(".cm-content");
            if (!cm) throw new Error("Block CodeMirror not found");
            if (
              document.activeElement !== cm &&
              !cm.contains(document.activeElement)
            ) {
              throw new Error("Block CodeMirror not focused");
            }
          },
          { timeout: 2000 },
        ),
      );

      // Verify: activeElement is set to the block
      const Window = yield* WindowT;
      const Buffer = yield* BufferT;
      const stream1 = yield* Window.subscribeActiveElement();
      const activeElement1 = yield* stream1.pipe(Stream.runHead);
      expect(Option.isSome(activeElement1)).toBe(true);
      const element1 = Option.getOrNull(activeElement1)!;
      expect(Option.isSome(element1)).toBe(true);

      // Also verify selection is set in the buffer
      const selectionBefore = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selectionBefore)).toBe(true);

      // When: Window loses focus (simulate alt-tab by mocking document.hasFocus)
      // This simulates the browser window losing focus - NOT clicking elsewhere
      yield* Effect.promise(async () => {
        // Mock document.hasFocus to return false (window lost focus)
        const originalHasFocus = document.hasFocus.bind(document);
        document.hasFocus = () => false;

        try {
          const blockEl = document.querySelector(
            `[data-element-id="${blockId}"]`,
          );
          const cm = blockEl?.querySelector(".cm-content") as HTMLElement;
          if (!cm) throw new Error("Block CodeMirror not found");

          // Dispatch focusout to simulate CodeMirror losing focus
          cm.dispatchEvent(
            new FocusEvent("focusout", { bubbles: true, relatedTarget: null }),
          );
          cm.blur();

          // Give blur handler time to process
          await new Promise((r) => setTimeout(r, 100));
        } finally {
          // Restore original hasFocus
          document.hasFocus = originalHasFocus;
        }
      });

      // Wait for any async handlers
      yield* Effect.sleep("300 millis");

      // Then: Selection should be PRESERVED (not cleared!)
      // This is the key assertion - window blur should NOT clear selection
      const selectionAfter = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selectionAfter)).toBe(true);

      // activeElement should also be preserved
      const stream2 = yield* Window.subscribeActiveElement();
      const activeElement2 = yield* stream2.pipe(Stream.runHead);
      expect(Option.isSome(activeElement2)).toBe(true);
      const element2 = Option.getOrNull(activeElement2)!;
      expect(Option.isSome(element2)).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("still clears selection when user clicks outside (document has focus)", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "Some text" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks on the block to focus it
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${blockId}"]`,
            );
            const cm = blockEl?.querySelector(".cm-content");
            if (!cm) throw new Error("Block CodeMirror not found");
            if (
              document.activeElement !== cm &&
              !cm.contains(document.activeElement)
            ) {
              throw new Error("Block CodeMirror not focused");
            }
          },
          { timeout: 2000 },
        ),
      );

      // Verify selection is set
      const Buffer = yield* BufferT;
      const selectionBefore = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selectionBefore)).toBe(true);

      // When: User clicks outside (document still has focus - this is NOT alt-tab)
      // document.hasFocus() returns true (default behavior)
      yield* Effect.promise(async () => {
        const blockEl = document.querySelector(
          `[data-element-id="${blockId}"]`,
        );
        const cm = blockEl?.querySelector(".cm-content") as HTMLElement;
        if (!cm) throw new Error("Block CodeMirror not found");

        // Dispatch focusout with relatedTarget being document.body
        // (simulating click on body, document still has focus)
        cm.dispatchEvent(
          new FocusEvent("focusout", {
            bubbles: true,
            relatedTarget: document.body,
          }),
        );
        cm.blur();
      });

      // Wait for blur to be processed
      yield* Effect.sleep("300 millis");

      // Then: Selection SHOULD be cleared (user clicked elsewhere in document)
      const selectionAfter = yield* Buffer.getSelection(bufferId);
      expect(Option.isNone(selectionAfter)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
