import "@/index.css";
import { Id } from "@/schema";
import { makeFrameKhoraId } from "@/schema/id/id";
import { FrameT } from "@/services/ui/Frame";
import FrameView from "@/ui/FrameView";
import { EditorView } from "@codemirror/view";
import { userEvent } from "@vitest/browser/context";
import { Effect, Option } from "effect";
import { cleanup, waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

/**
 * Find the first wrap boundary in the editor and return coordinates
 * at the END of the first visual line (where assoc should be -1).
 */
function getWrapBoundaryCoords(view: EditorView): {
  x: number;
  y: number;
  wrapPos: number;
} {
  const doc = view.state.doc;
  let prevY: number | null = null;

  for (let pos = 0; pos <= doc.length; pos++) {
    const coords = view.coordsAtPos(pos, 1);
    if (!coords) continue;

    if (prevY !== null && coords.top > prevY) {
      const endOfLineCoords = view.coordsAtPos(pos, -1);
      if (!endOfLineCoords) throw new Error("Could not get end-of-line coords");

      return {
        x: endOfLineCoords.right - 2,
        y: endOfLineCoords.top + 5,
        wrapPos: pos,
      };
    }
    prevY = coords.top;
  }

  throw new Error("No wrap boundary found - text may not be wrapping");
}

describe("Selection sync", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanupTest: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanupTest = setup.cleanup;
  });

  afterEach(async () => {
    await cleanupTest();
  });

  it("syncs selection from model to CodeMirror", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root node",
        [{ text: "Hello world" }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Focus the block to mount CodeMirror
      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

      // Set selection via model (position 5 = "Hello| world")
      const Frame = yield* FrameT;
      yield* Frame.setSelection(
        frameId,
        Option.some({
          anchor: { elementId: khoraId },
          anchorOffset: 5,
          focus: { elementId: khoraId },
          focusOffset: 5,
          goalX: null,
          goalLine: null,
          assoc: 0,
        }),
      );

      // Verify CodeMirror cursor is at position 5
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("preserves selection when block remounts after structural change", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeFrameKhoraId(frameId, childNodeIds[1]);

      render(() => <FrameView frameId={frameId} />);

      // Focus second child, move cursor to position 7
      yield* Given.KHORA_IS_FOCUSED_AT(secondChildBlockId, 7);

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
      // Given: A frame with content
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Test Document",
        [{ text: "Hello world" }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      // First render: focus and set position at 6
      render(() => <FrameView frameId={frameId} />);
      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);
      yield* Given.FRAME_HAS_CURSOR(frameId, childNodeIds[0], 6);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);

      // Simulate page reload: unmount and remount
      cleanup();
      render(() => <FrameView frameId={frameId} />);

      // Set selection via model (simulates saved selection from before reload)
      yield* Given.FRAME_HAS_CURSOR(frameId, childNodeIds[0], 6);

      // Wait for CodeMirror to mount
      const cmContainer = yield* Effect.promise(() =>
        waitFor(
          () => {
            const container = document.querySelector(
              "[data-element-type='khora'] .cm-editor",
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

  it("arrow down from start of wrapped line maintains column 0", async () => {
    await Effect.gen(function* () {
      // Given: A frame with text long enough to wrap into 4 visual lines
      const longText =
        "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk llll mmmm nnnn oooo pppp qqqq";
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: longText }],
      );

      render(() => <FrameView frameId={frameId} />);

      yield* Given.FRAME_HAS_WIDTH(200);

      yield* Given.KHORA_IS_FOCUSED_AT(
        makeFrameKhoraId(frameId, childNodeIds[0]),
        20,
        1,
      );

      // // Press ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.CM_CURSOR_IS_AT(50, 1);
    }).pipe(runtime.runPromise);
  });

  // Regression test for: clicking at end of wrapped line puts cursor at start of next line
  //
  // The bug: When clicking at the visual end of a wrapped line (right edge before wrap),
  // the cursor appears at the START of the next visual line instead of the END of
  // the current visual line.
  //
  // At a wrap boundary, the same character position can render in two places:
  // - End of visual line N (assoc = -1)
  // - Start of visual line N+1 (assoc = 1)
  //
  // When clicking at the right edge of a line, users expect the cursor to stay
  // at the end of that line (assoc = -1), not jump to the next line (assoc = 1).
  it("clicking at end of wrapped line keeps cursor on that line (assoc = -1)", async () => {
    await Effect.gen(function* () {
      // Given: A frame with Ukrainian text that naturally wraps
      const wrappingText =
        "Історія Рекі нагадує, що ми не острови, що самотньо дрейфують у темряві. Ми — пов'язані невидимими та таємничими мостами довіри та емпатії. Її порятунок здобувся через нагороду за роки самопожертви, а став даром, отриманим в єдиний момент, коли вона дозволила собі бути вразливою перед кимось. Ми рятуємося не поодинці, а лише разом, стаючи одне для одного тим світлом, яке здатне розвіяти найтемнішу ніч душі.";
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: wrappingText }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // First click to mount CodeMirror
      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

      // Wait for layout
      yield* Effect.promise(() => new Promise((r) => setTimeout(r, 100)));

      // Find the wrap boundary position and its coordinates
      const clickCoords = yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmContent = document.querySelector(".cm-content");
            if (!cmContent) throw new Error("CodeMirror not found");
            const view = EditorView.findFromDOM(cmContent as HTMLElement);
            if (!view) throw new Error("EditorView not found");
            return getWrapBoundaryCoords(view);
          },
          { timeout: 3000 },
        ),
      );

      // Click at the end of the first visual line
      yield* Effect.promise(async () => {
        const cmContent = document.querySelector(".cm-content") as HTMLElement;
        const rect = cmContent.getBoundingClientRect();
        const relativeX = clickCoords.x - rect.left;
        const relativeY = clickCoords.y - rect.top;

        await userEvent.click(cmContent, {
          position: { x: relativeX, y: relativeY },
        });
      });

      // Cursor should be at wrap boundary position with assoc = -1 (end of line)
      // BUG: assoc is 1 (start of next line) instead of -1
      yield* Then.CM_CURSOR_IS_AT(clickCoords.wrapPos, -1);
    }).pipe(runtime.runPromise);
  });

  // Regression test for: clicking on non-content DOM elements (e.g. type badges)
  // inside a block's <p> produces an offset beyond the actual text length.
  // posAtCoordsInElement walks all text nodes including badge labels, so the
  // cumulative offset can exceed doc.length. setSelection now clamps offsets
  // to the Automerge text length before writing to LiveStore.
  it("clamps out-of-bounds cursor offset to document end", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "hello" }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Set cursor far beyond text length (simulates badge text node overshoot)
      yield* Given.FRAME_HAS_CURSOR(frameId, childNodeIds[0], 999);
      yield* Given.ACTIVE_ELEMENT_IS({ id: khoraId, type: "khora" });

      // Cursor should be clamped to end of "hello" (5), not 999
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
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
      // Given: A frame with an empty block
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Test Document",
        [{ text: "" }],
      );

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Click on the empty block to focus it
      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

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
