import "@/index.css";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { describe, expect, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block ArrowDown key", () => {
  it("moves to next sibling when ArrowDown pressed on last line", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first child, cursor at position 3 ("Fir|st")
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      // Press ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Should now be in the second block (offset determined by pixel X)
      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves column when target block's first line is long enough", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Short" }, { text: "LongSecondBlock" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first child at position 4 ("Shor|t")
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(4);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
      // Column 4 preserved in "LongSecondBlock" → "Long|SecondBlock"
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
    }).pipe(runtime.runPromise);
  });

  it("clamps to end of line when target line is shorter than current column", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "LongerText" }, { text: "Hi" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first child at position 8 ("LongerTe|xt")
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(8);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
      // "Hi" only has 2 chars, so clamp to end (position 2)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
    }).pipe(runtime.runPromise);
  });

  it("moves to first child when current block has children", async () => {
    await Effect.gen(function* () {
      // Create: Root -> [Parent]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Parent" }],
      );

      // Add child to Parent: Parent -> [Child]
      const childId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Child",
      });

      const parentBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the parent at column 3
      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowDown}");

      // Should now be in the child block (first child)
      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent's next sibling when at last child", async () => {
    await Effect.gen(function* () {
      // Create: Root -> [First, Second]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      // Add child to First: First -> [Nested]
      const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const nestedChildBlockId = Id.makeBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus nested child (last child of First) at column 3
      yield* When.USER_CLICKS_BLOCK(nestedChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowDown}");

      // Should now be in Second (parent's next sibling)
      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("maintains goal X when traveling from sibling's nested child to next sibling", async () => {
    await Effect.gen(function* () {
      // Structure: Root -> [First, Second]
      //            First -> [Nested] (indented by 16px)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second block here" }],
      );

      // Add nested child to First
      const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested child content",
      });

      const nestedBlockId = Id.makeBlockId(bufferId, nestedId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus nested child at position 5
      yield* When.USER_CLICKS_BLOCK(nestedBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      // Capture pixel X before navigation
      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        return range.getBoundingClientRect().left;
      });

      yield* When.USER_PRESSES("{ArrowDown}");

      // Capture pixel X after navigation (now in Second, which is less indented)
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
        [{ text: "WW" }, { text: "iiiiiiiiii" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first child at end (position 2, after "WW")
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(2);

      // Capture pixel X before navigation
      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        return rect.left;
      });

      yield* When.USER_PRESSES("{ArrowDown}");

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

  it("navigates within wrapped line before jumping to next block", async () => {
    // ******* GIVEN THE BUFFER *******
    // Buffer width: 100px (forces wrapping)
    // Title
    // ==========
    // ▶ AAAA BBBB|    <- cursor at END of first visual line (via {End})
    //   CCCC DDDD     <- second visual line (wrapped)
    //   EEEE          <- third visual line
    //
    // ▶ Second block
    //
    // ******* WHEN *******
    // User presses ArrowDown from end of first visual line
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves DOWN to second visual line within the same block
    // NOT to "Second block"
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Set narrow width to force wrapping
      yield* Given.BUFFER_HAS_WIDTH(100);

      // This is hacky. Selection should be set through Selection in model
      // the problem is that user_clicks_block within a narrow buffer set's selection somewhere in the middle
      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{Home}");
      yield* When.USER_PRESSES("{ArrowLeft}");
      yield* When.USER_PRESSES("{Home}");
      yield* When.USER_PRESSES("{End}");

      // ArrowDown from end of first visual line
      yield* When.USER_PRESSES("{ArrowDown}");

      // Should still be in the same block (moved to next visual line)
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("navigates within wrapped line from START of first visual line", async () => {
    // ******* GIVEN THE BUFFER *******
    // Buffer width: 100px (forces wrapping)
    // Title
    // ==========
    // ▶ |AAAA BBBB    <- cursor at START of first visual line (position 0)
    //   CCCC DDDD     <- second visual line (wrapped)
    //   EEEE          <- third visual line
    //
    // ▶ Second block
    //
    // ******* WHEN *******
    // User presses ArrowDown from start of first visual line
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves DOWN to second visual line within the same block
    // NOT to "Second block"
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Set narrow width to force wrapping
      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      // Set selection to position 0 via model
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 0);

      // ArrowDown from start of first visual line (position 0)
      yield* When.USER_PRESSES("{ArrowDown}");

      // Should still be in the same block (moved to next visual line)
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to next block when cursor is at start of last visual line", async () => {
    // ******* GIVEN THE BUFFER *******
    // Buffer width: 100px (forces wrapping)
    // Title
    // ==========
    // ▶ AAAA BBBB     <- first visual line
    //   |CCCC DDDD    <- cursor at START of second visual line (position 10)
    //
    // ▶ Second block
    //
    // ******* WHEN *******
    // User presses ArrowDown
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves to "Second block" because we're on the LAST visual line
    // NOT stay in current block (which happens if assoc isn't tracked)
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Set narrow width to force wrapping
      yield* Given.BUFFER_HAS_WIDTH(100);

      // Focus the first block
      yield* When.USER_CLICKS_BLOCK(firstBlockId);

      // Set selection to position 10 (wrap point - start of "CCCC") via model
      // This is where associativity matters: position 10 could be:
      // - END of "AAAA BBBB " (line 1) - assoc=-1
      // - START of "CCCC DDDD" (line 2) - assoc=+1
      // We want it at START of line 2, so ArrowDown should go to next block
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 10, 1);

      // Press ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Should move to second block (since we're on the last visual line)
      yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves cursor to end of block when at last block and pressing ArrowDown", async () => {
    // ******* GIVEN THE BUFFER *******
    // Title
    // ==========
    // ▶ First block
    // ▶ Last b|lock    <- cursor at position 5
    //
    // ******* WHEN *******
    // User presses ArrowDown (no blocks below)
    //
    // ******* EXPECTED BEHAVIOR *******
    // Cursor moves to end of "Last block" (position 10)
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "First block" }, { text: "Last block" }],
      );

      const lastBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(lastBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[1], 5);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(lastBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(10);
    }).pipe(runtime.runPromise);
  });

  it("moves from title to first block when ArrowDown pressed", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus title at position 5 ("Docum|ent Title")
      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      yield* When.USER_PRESSES("{ArrowDown}");

      // Should move to first block (offset determined by pixel X)
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX when navigating DOWN from wrapped title to block", async () => {
    // ******* GIVEN THE BUFFER *******
    // Buffer width: ~350px (forces title to wrap)
    //
    // - Once upon a midnight   ← first visual line of title
    //   dreary                 ← second visual line (wrapped)
    // ====
    // ▶ While I nodded nearly napping|  ← cursor starts AND ends here
    // ▶ Second block text here
    //
    // ******* EXPECTED BEHAVIOR *******
    // 1. ArrowUp from "While I nodded..." → Title (last visual line "dreary")
    // 2. ArrowUp within title → first visual line ("Once upon...")
    // 3. ArrowDown within title → back to "dreary" line
    // 4. ArrowDown from title → "While I nodded..." block
    //
    // The cursor should land at the same viewport X position (goalX preserved)
    await Effect.gen(function* () {
      const Buffer = yield* BufferT;

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Once upon a midnight dreary",
        [{ text: "While I nodded nearly napping" }, { text: "Second block text here" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(350);

      // Focus first block at END ("While I nodded nearly napping|")
      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_MOVES_CURSOR_TO(29);

      // Capture initial pixel X
      const xInBlock = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });
      console.log("xInBlock:", xInBlock);

      // Navigate: Block1 → Title (dreary) → Title (Once upon)
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_TITLE(bufferId);

      // Verify goalX is set in model before going down
      const selInTitle = yield* Buffer.getSelection(bufferId);
      console.log(
        "Selection in title (should have goalX):",
        JSON.stringify(Option.getOrNull(selInTitle), null, 2),
      );

      // Now navigate back down: Title (Once upon) → Title (dreary) → Block1
      yield* When.USER_PRESSES("{ArrowDown}");
      yield* When.USER_PRESSES("{ArrowDown}");

      // Should be back in first block
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      // Check model state - goalX should be preserved from original position
      const selInBlock = yield* Buffer.getSelection(bufferId);
      console.log(
        "Selection after navigating back:",
        JSON.stringify(Option.getOrNull(selInBlock), null, 2),
      );

      // Capture final pixel X
      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          return sel.getRangeAt(0).getBoundingClientRect().left;
        }),
      );
      console.log("xAfter:", xAfter);

      // Pixel X should be preserved within a reasonable tolerance
      const delta = Math.abs(xAfter - xInBlock);
      expect(delta).toBeLessThan(10);
    }).pipe(runtime.runPromise);
  });
});
