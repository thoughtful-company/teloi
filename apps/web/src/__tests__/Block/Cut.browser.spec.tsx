import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Cut selected blocks (Mod+X)", () => {
  let clipboardContent: string = "";

  beforeEach(() => {
    clipboardContent = "";
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
      async (text) => {
        clipboardContent = text;
      },
    );
    vi.spyOn(navigator.clipboard, "readText").mockImplementation(async () => {
      return clipboardContent;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Mod+X cuts single selected block (copies and deletes)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a block selected
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(blockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // When: User presses Mod+X
      yield* When.USER_PRESSES("{Meta>}x{/Meta}");

      // Then: Clipboard contains the block text
      yield* Then.CLIPBOARD_CONTAINS("Hello world");

      // And: Block is deleted from DOM and model
      yield* Then.BLOCK_COUNT_IS(0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
    }).pipe(runtime.runPromise);
  });

  it("Mod+X cuts multiple blocks with double newlines", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 3 blocks, first two selected
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First block" },
          { text: "Second block" },
          { text: "Third block" },
        ]);

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Extend selection to include second block
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[0],
        childNodeIds[1],
      ]);

      // When: User presses Mod+X
      yield* When.USER_PRESSES("{Meta>}x{/Meta}");

      // Then: Clipboard contains both blocks separated by double newline
      yield* Then.CLIPBOARD_CONTAINS("First block\n\nSecond block");

      // And: First two blocks deleted, third block remains
      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_TEXT(childNodeIds[2], "Third block");
    }).pipe(runtime.runPromise);
  });

  it("Mod+X respects document order (not selection order)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 3 blocks, select from third going up
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "Alpha" },
          { text: "Beta" },
          { text: "Gamma" },
        ]);

      const thirdBlockId = Id.makeBlockId(bufferId, childNodeIds[2]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(thirdBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[2]]);

      // Extend selection upward to include all blocks (anchor = third, focus = first)
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowUp}{/Shift}");

      yield* Then.BLOCKS_ARE_SELECTED(
        bufferId,
        [childNodeIds[0], childNodeIds[1], childNodeIds[2]],
        { anchor: childNodeIds[2], focus: childNodeIds[0] },
      );

      // When: User presses Mod+X
      yield* When.USER_PRESSES("{Meta>}x{/Meta}");

      // Then: Clipboard contains blocks in document order (Alpha, Beta, Gamma)
      // NOT in selection order (Gamma first because it was anchor)
      yield* Then.CLIPBOARD_CONTAINS("Alpha\n\nBeta\n\nGamma");

      // And: All blocks deleted
      yield* Then.BLOCK_COUNT_IS(0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
    }).pipe(runtime.runPromise);
  });

  it("Mod+X manages focus after deletion", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with 4 blocks, middle two selected
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First" },
          { text: "Second" },
          { text: "Third" },
          { text: "Fourth" },
        ]);

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      // Extend selection to include third block
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[1],
        childNodeIds[2],
      ]);

      // When: User presses Mod+X
      yield* When.USER_PRESSES("{Meta>}x{/Meta}");

      // Then: Clipboard contains deleted blocks
      yield* Then.CLIPBOARD_CONTAINS("Second\n\nThird");

      // And: Two blocks remain (First and Fourth)
      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      // And: Focus moves to block BEFORE selection (First block)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);
    }).pipe(runtime.runPromise);
  });

  it("Mod+X cuts nested child block (copies and deletes)", async () => {
    await Effect.gen(function* () {
      // Given: Root → Parent → [ChildA, ChildB]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );
      const parentNodeId = childNodeIds[0];

      // Add nested children to Parent
      const nestedChildA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Nested Child A",
      });
      const nestedChildB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Nested Child B",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select nested child A
      const nestedBlockId = Id.makeBlockId(bufferId, nestedChildA);
      yield* When.USER_ENTERS_BLOCK_SELECTION(nestedBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nestedChildA]);

      // When: User presses Mod+X
      yield* When.USER_PRESSES("{Meta>}x{/Meta}");

      // Then: Clipboard contains the nested block's text
      yield* Then.CLIPBOARD_CONTAINS("Nested Child A");

      // And: Nested child A is deleted, B remains
      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 1);
      yield* Then.NODE_HAS_TEXT(nestedChildB, "Nested Child B");

      // And: Selection moves to sibling B
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nestedChildB]);
    }).pipe(runtime.runPromise);
  });

  it("Mod+X cuts multiple nested children", async () => {
    await Effect.gen(function* () {
      // Given: Root → Parent → [ChildA, ChildB, ChildC]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );
      const parentNodeId = childNodeIds[0];

      // Add nested children to Parent
      const nestedChildA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Alpha",
      });
      const nestedChildB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Beta",
      });
      const nestedChildC = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Gamma",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select first two nested children
      const nestedBlockA = Id.makeBlockId(bufferId, nestedChildA);
      yield* When.USER_ENTERS_BLOCK_SELECTION(nestedBlockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nestedChildA, nestedChildB]);

      // When: User presses Mod+X
      yield* When.USER_PRESSES("{Meta>}x{/Meta}");

      // Then: Clipboard contains both nested blocks
      yield* Then.CLIPBOARD_CONTAINS("Alpha\n\nBeta");

      // And: Only Gamma remains under Parent
      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 1);
      yield* Then.NODE_HAS_TEXT(nestedChildC, "Gamma");
    }).pipe(runtime.runPromise);
  });
});
