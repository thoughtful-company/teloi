import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block ArrowUp key", () => {
  it("navigates within multi-line block (with newlines) before jumping to previous block", async () => {
    // ******* GIVEN THE BUFFER *******
    // Title
    // ==========
    // ▶ Line1
    //   Line2
    //   Li|ne3  ← CURSOR ON LAST LINE (position 14)
    //
    // ******* WHEN *******
    // User presses ArrowUp
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves UP within the same block (to Line2)
    // NOT to the previous block (Title)
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "Line1\nLine2\nLine3" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the block and move to Line3 (position 14 = "Line1\nLine2\nLi|ne3")
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(14);

      // Press ArrowUp - should move to Line2, NOT to Title
      yield* When.USER_PRESSES("{ArrowUp}");

      // Should still be in the same block
      yield* Then.SELECTION_IS_ON_BLOCK(blockId);
    }).pipe(runtime.runPromise);
  });

  it("navigates within wrapped line before jumping to previous block", async () => {
    // ******* GIVEN THE BUFFER *******
    // Title
    // ==========
    // ▶ This is a very long text that will definitely wrap to multiple
    //   visual lines in the editor because it exceeds the container| width
    //                                                               ^
    //                                        CURSOR ON WRAPPED PORTION
    //
    // ******* WHEN *******
    // User presses ArrowUp
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves UP within the same block (to previous visual line)
    // NOT to the previous block (Title)
    await Effect.gen(function* () {
      // Text long enough to wrap (no \n - single logical line, multiple visual lines)
      const longText =
        "This is a very long text that will definitely wrap to multiple visual lines in the editor because it exceeds the container width and needs to flow onto subsequent rows";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: longText }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the block and move to near the end (should be on wrapped line)
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(longText.length - 10); // Near end

      // Press ArrowUp - should move within block, NOT to Title
      yield* When.USER_PRESSES("{ArrowUp}");

      // Should still be in the same block (on previous visual line)
      yield* Then.SELECTION_IS_ON_BLOCK(blockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to previous sibling when ArrowUp pressed on first line", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, cursor at position 3 ("Sec|ond")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      // Press ArrowUp
      yield* When.USER_PRESSES("{ArrowUp}");

      // Should now be in the first block (offset determined by pixel X)
      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves column when target block's last line is long enough", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "LongFirstBlock" }, { text: "Short" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at position 4 ("Shor|t")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(4);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
      // Column 4 preserved in "LongFirstBlock" → "Long|FirstBlock"
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
    }).pipe(runtime.runPromise);
  });

  it("clamps to end of line when target line is shorter than current column", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hi" }, { text: "LongerText" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at position 8 ("LongerTe|xt")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(8);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
      // "Hi" only has 2 chars, so clamp to end (position 2)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
    }).pipe(runtime.runPromise);
  });

  it("moves to deepest last child of previous sibling when it has children", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Create: Root -> [First, Second]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      // Add child to First: First -> [Nested]
      const nestedChildId = yield* Node.insertNode({
        parentId: childNodeIds[0],
        insert: "after",
        textContent: "Nested",
      });

      const nestedChildBlockId = Id.makeBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at column 3
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowUp}");

      // Should now be in the nested child (deepest of previous sibling)
      yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent when at first child", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Create: Root -> [Parent]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Parent" }],
      );

      // Add child to Parent: Parent -> [Child]
      const childId = yield* Node.insertNode({
        parentId: childNodeIds[0],
        insert: "after",
        textContent: "Child",
      });

      const parentBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the child (first child of Parent) at column 3
      yield* When.USER_CLICKS_BLOCK(childBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowUp}");

      // Should now be in the parent block
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("maintains goal X when traveling from sibling to previous block's nested child", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Structure: Root -> [First, Second]
      //            First -> [Nested] (indented by 16px)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second block here" }],
      );

      // Add nested child to First
      yield* Node.insertNode({
        parentId: childNodeIds[0],
        insert: "after",
        textContent: "Nested child content",
      });

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at position 5
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      // Capture pixel X before navigation
      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        return range.getBoundingClientRect().left;
      });

      yield* When.USER_PRESSES("{ArrowUp}");

      // Capture pixel X after navigation (now in Nested, which is indented)
      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          const range = sel.getRangeAt(0);
          return range.getBoundingClientRect().left;
        }),
      );

      // Pixel X should be preserved despite the 16px indent difference
      const delta = Math.abs(xAfter - xBefore);
      expect(delta).toBeLessThan(5);
    }).pipe(runtime.runPromise);
  });

  it("maintains visual X position with non-monospace fonts (iii vs WWW)", async () => {
    await Effect.gen(function* () {
      // "W" is wider than "i" in non-monospace fonts
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "iiiiiiiiii" }, { text: "WW" }],
      );

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at end (position 2, after "WW")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(2);

      // Capture pixel X before navigation
      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        return rect.left;
      });

      yield* When.USER_PRESSES("{ArrowUp}");

      // Capture pixel X after navigation
      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          const range = sel.getRangeAt(0);
          return range.getBoundingClientRect().left;
        }),
      );

      // Pixel X should be preserved within a small tolerance (e.g., 5px)
      const delta = Math.abs(xAfter - xBefore);
      expect(delta).toBeLessThan(5);
    }).pipe(runtime.runPromise);
  });

  it("moves to prev block when cursor is at end of first visual line", async () => {
    // ******* GIVEN THE BUFFER *******
    // Buffer width: 100px (forces wrapping)
    // Title
    // ==========
    // ▶ First block
    //
    // ▶ AAAA BBBB|    <- cursor at END of first visual line (position 10, assoc=-1)
    //   CCCC DDDD     <- second visual line (wrapped)
    //
    // ******* WHEN *******
    // User presses ArrowUp
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves to "First block" because we're on the FIRST visual line
    // NOT stay in current block (which happens if assoc isn't used)
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "First block" }, { text: wrappingText }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Set narrow width to force wrapping
      yield* Given.BUFFER_HAS_WIDTH(100);

      // Focus the second block
      yield* When.USER_CLICKS_BLOCK(secondBlockId);

      // Set selection to position 10 (wrap point - end of "BBBB ") via model
      // This is where associativity matters: position 10 could be:
      // - END of "AAAA BBBB " (line 1) - assoc=-1
      // - START of "CCCC DDDD" (line 2) - assoc=+1
      // We want it at END of line 1, so ArrowUp should go to prev block
      yield* When.SELECTION_IS_SET_TO(bufferId, secondBlockId, 10, -1);

      // Press ArrowUp
      yield* When.USER_PRESSES("{ArrowUp}");

      // Should move to first block (since we're on the first visual line)
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to title when at first block in document", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first block at position 5 ("First| block")
      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      yield* When.USER_PRESSES("{ArrowUp}");

      // Should move to title (offset determined by pixel X)
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("lands on last visual line of wrapping block when navigating up", async () => {
    // ******* GIVEN THE BUFFER *******
    // Buffer width: 100px (forces wrapping)
    // Title
    // ==========
    // ▶ AAAA BBBB     <- first visual line of wrapping block
    //   CCCC DDDD     <- LAST visual line (cursor should land HERE)
    //
    // ▶ Second        <- cursor starts here
    //
    // ******* WHEN *******
    // User presses ArrowUp
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor lands on LAST visual line of first block (CCCC DDDD row)
    // Pressing ArrowUp again should stay in the same block (move to first visual line)
    //
    // ******* BUGGY BEHAVIOR *******
    // Cursor lands on FIRST visual line (AAAA BBBB row)
    // Pressing ArrowUp again would move to Title
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX when title WRAPS to multiple visual lines", async () => {
    // ******* GIVEN THE BUFFER (actual user bug) *******
    // Buffer width: ~450px (forces title to wrap)
    //
    // - Once upon a midnight   ← first visual line of title
    //   dreary                 ← second visual line (wrapped)
    // ====
    // ▶ While
    // ▶ I pondered weak and|   ← cursor at END
    //
    // ******* EXPECTED BEHAVIOR *******
    // ArrowUp from "I pondered..." should:
    // 1. Go to "While" (landing on last visual line, using goalX)
    // 2. Go to Title (landing on LAST visual line "dreary", using goalX)
    //
    // The cursor should land at the same viewport X position.
    //
    // ******* BUG *******
    // Cursor lands at wrong position (e.g., position 4 instead of expected)
    // because goalX isn't being applied correctly to wrapped title
    await Effect.gen(function* () {
      const Buffer = yield* BufferT;

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Once upon a midnight dreary",
        [{ text: "While" }, { text: "I pondered weak and" }],
      );

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // User reported buffer width ~450px
      yield* Given.BUFFER_HAS_WIDTH(350);

      // Focus second block at END ("I pondered weak and|")
      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.USER_MOVES_CURSOR_TO(19); // End of "I pondered weak and"

      // Capture initial pixel X
      const xInBlock = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });
      console.log("xInBlock:", xInBlock);

      // Navigate up twice (Block2 -> While -> Title (last line) -> Title (first line))
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      // Should be in title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);

      // Check model state
      const selInTitle = yield* Buffer.getSelection(bufferId);
      console.log(
        "Selection in title:",
        JSON.stringify(Option.getOrNull(selInTitle), null, 2),
      );

      // Capture final pixel X, offset, and Y position to check which visual line
      const { xInTitle, yInTitle, offset, titleRect } = yield* Effect.promise(
        () =>
          waitFor(() => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) throw new Error("No selection");
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const titleEl = document.querySelector(
              "[data-element-type='title']",
            );
            return {
              xInTitle: rect.left,
              yInTitle: rect.top,
              offset: sel.anchorOffset,
              titleRect: titleEl?.getBoundingClientRect(),
            };
          }),
      );

      // Check if title actually wraps by comparing Y of first char vs last char
      const titleElement = yield* Effect.sync(() =>
        document.querySelector("[data-element-type='title'] .cm-content"),
      );
      const titleLineInfo = yield* Effect.sync(() => {
        if (!titleElement) return null;
        const range = document.createRange();
        const textNode = titleElement.querySelector(".cm-line")?.firstChild;
        if (!textNode) return null;

        // Get Y of first character
        range.setStart(textNode, 0);
        range.setEnd(textNode, 1);
        const firstCharY = range.getBoundingClientRect().top;

        // Get Y of last character
        const textLength = (textNode as Text).length;
        range.setStart(textNode, textLength - 1);
        range.setEnd(textNode, textLength);
        const lastCharY = range.getBoundingClientRect().top;

        return { firstCharY, lastCharY, wraps: firstCharY !== lastCharY };
      });

      console.log(
        "xInTitle:",
        xInTitle,
        "yInTitle:",
        yInTitle,
        "offset:",
        offset,
      );
      console.log("Title wrapping info:", titleLineInfo);
      console.log("Delta:", Math.abs(xInTitle - xInBlock));

      // The key assertion: pixel X should be preserved
      const delta = Math.abs(xInTitle - xInBlock);
      expect(delta).toBeLessThan(10);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX across multiple ArrowUp presses through shorter blocks", async () => {
    // ******* GIVEN THE BUFFER *******
    // Long paragraph   (14 chars)
    // Short            (5 chars)
    // Long paragraph|  ← CURSOR AT END (position 14)
    //
    // ******* WHEN *******
    // User presses ArrowUp twice
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor should end up at position 14 in first block (same pixel X as start)
    // Long paragraph|
    //               ^ CURSOR HERE
    // NOT at position 5 like:
    // Long |paragraph
    //      ^ WRONG - this happens if goalX resets after first navigation
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [
          { text: "Long paragraph" },
          { text: "Short" },
          { text: "Long paragraph" },
        ],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const thirdBlockId = Id.makeBlockId(bufferId, childNodeIds[2]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus third block at end (position 14)
      yield* When.USER_CLICKS_BLOCK(thirdBlockId);
      yield* When.USER_MOVES_CURSOR_TO(14);

      // Capture initial pixel X
      const xInitial = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });

      // Press ArrowUp twice
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      // Should be in first block
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      // Capture final pixel X
      const xFinal = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          return sel.getRangeAt(0).getBoundingClientRect().left;
        }),
      );

      // Pixel X should be preserved - cursor should be at position 14, not 5
      const delta = Math.abs(xFinal - xInitial);
      expect(delta).toBeLessThan(5);

      // Also verify the offset is 14, not 5
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(14);
    }).pipe(runtime.runPromise);
  });
});
