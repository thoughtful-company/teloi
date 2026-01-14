import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, When, setupClientTest, type BrowserRuntime } from "../bdd";

function waitForEditorFocus() {
  return Effect.promise(() =>
    waitFor(
      () => {
        const cmEditor = document.querySelector(".cm-editor.cm-focused");
        if (!cmEditor) throw new Error("CodeMirror not focused");
      },
      { timeout: 2000 },
    ),
  );
}

const ALICE_TEXT =
  'Alice was not a bit hurt, and she jumped up on to her feet in a moment: she looked up, but it was all dark overhead; before her was another long passage, and the White Rabbit was still in sight, hurrying down it. There was not a moment to be lost: away went Alice like the wind, and was just in time to hear it say, as it turned a corner, "Oh my ears and whiskers, how late it\'s getting!" She was close behind it when she turned the corner, but the Rabbit was no longer to be seen: she found herself in a long, low hall, which was lit up by a row of lamps hanging from the roof.';

// Cursor position: after "Alice" in "away went Alice like the wind"
const CURSOR_POSITION = ALICE_TEXT.indexOf("Alice like the wind") + 5;

describe("Scroll behavior", () => {
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
   * Setup:
   * - First block: Alice text with cursor at position 263
   * - 30 more blocks: "Line N: CONTENT"
   * - Container: 300px height, scrolled to 500px
   * - Cursor is OFF-SCREEN (above visible area)
   */
  const setupScrollTest = () =>
    Effect.gen(function* () {
      const children = [
        { text: ALICE_TEXT },
        ...Array.from({ length: 30 }, (_, i) => ({
          text: `Line ${i + 1}: CONTENT`,
        })),
      ];

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        children,
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]!);

      render(() => (
        <div class="overflow-y-auto" style={{ height: "300px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      // Set selection directly
      yield* When.SELECTION_IS_SET_TO(
        bufferId,
        childNodeIds[0]!,
        CURSOR_POSITION,
      );

      // Set active element directly (don't click - that resets selection)
      yield* Given.ACTIVE_ELEMENT_IS({ id: firstBlockId, type: "block" });

      yield* waitForEditorFocus();
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 5)),
      );

      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      // Scroll down so cursor is off-screen (above visible area)
      scrollContainer.scrollTop = 500;

      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 5)),
      );

      return { scrollContainer, bufferId, childNodeIds, firstBlockId };
    });

  it("ArrowDown scrolls cursor into view when off-screen", async () => {
    await Effect.gen(function* () {
      const { scrollContainer } = yield* setupScrollTest();

      const scrollTopBefore = scrollContainer.scrollTop;
      expect(scrollTopBefore).toBe(500);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 300)),
      );

      const scrollTopAfter = scrollContainer.scrollTop;
      expect(scrollTopAfter).toBeLessThan(scrollTopBefore);
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp scrolls cursor into view when off-screen", async () => {
    await Effect.gen(function* () {
      const { scrollContainer } = yield* setupScrollTest();

      const scrollTopBefore = scrollContainer.scrollTop;
      expect(scrollTopBefore).toBe(500);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 300)),
      );

      const scrollTopAfter = scrollContainer.scrollTop;
      expect(scrollTopAfter).toBeLessThan(scrollTopBefore);
    }).pipe(runtime.runPromise);
  });
});
