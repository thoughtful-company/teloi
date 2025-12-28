import "@/index.css";
import { Id } from "@/schema";
import { WindowT } from "@/services/ui/Window";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option, Stream } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, When } from "../bdd";

describe("Block blur clears activeElement", () => {
  // BUG: When block is blurred by clicking outside, activeElement persists.
  // This causes the block to be focused again on page reload.

  it("clears activeElement when clicking outside focused block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "Some text" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks on the block
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(`[data-element-id="${blockId}"]`);
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
      const stream1 = yield* Window.subscribeActiveElement();
      const activeElement1 = yield* stream1.pipe(Stream.runHead);
      expect(Option.isSome(activeElement1)).toBe(true);
      const element1 = Option.getOrNull(activeElement1)!;
      expect(Option.isSome(element1)).toBe(true);
      const elementValue1 = Option.getOrNull(element1)!;
      expect(elementValue1.type).toBe("block");
      expect((elementValue1 as { id: string }).id).toBe(blockId);

      // When: User blurs the CodeMirror (clicks outside the editor)
      yield* Effect.promise(async () => {
        const blockEl = document.querySelector(`[data-element-id="${blockId}"]`);
        const cm = blockEl?.querySelector(".cm-content") as HTMLElement;
        if (!cm) throw new Error("Block CodeMirror not found");
        cm.blur();
      });

      // Wait for blur to be processed
      yield* Effect.sleep("300 millis");

      // Then: activeElement should be cleared (None)
      const stream2 = yield* Window.subscribeActiveElement();
      const activeElement2 = yield* stream2.pipe(Stream.runHead);

      expect(Option.isSome(activeElement2)).toBe(true);
      const element2 = Option.getOrNull(activeElement2)!;
      expect(Option.isNone(element2)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
