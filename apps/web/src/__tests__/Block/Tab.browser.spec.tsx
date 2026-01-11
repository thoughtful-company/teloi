import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BlockT } from "@/services/ui/Block";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Tab key", () => {
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

  it("indents block to become child of previous sibling when Tab pressed", async () => {
    await Effect.gen(function* () {
      // Setup: root with two children
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child and press Tab
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_PRESSES("{Tab}");

      // Root should now have only one child (the first one)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // First child should now have one child (the second one, which was indented)
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Verify the indented node is now child of first sibling
      const Node = yield* NodeT;
      const firstChildChildren = yield* Node.getNodeChildren(childNodeIds[0]);
      yield* Then.NODE_HAS_TEXT(firstChildChildren[0]!, "Second child");
    }).pipe(runtime.runPromise);
  });

  it("indents block when text is selected", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, select some text, then press Tab
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_PRESSES("{Shift>}{End}{/Shift}"); // Select all text
      yield* When.USER_PRESSES("{Tab}");

      // Should still indent despite having selection
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Text should be preserved (not replaced by tab character)
      yield* Then.NODE_HAS_TEXT(childNodeIds[1], "Second child");
    }).pipe(runtime.runPromise);
  });

  it("preserves cursor position after indentation", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, move cursor to position 7 ("Second |child")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(7);
      yield* When.USER_PRESSES("{Tab}");

      // Should indent
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Cursor should still be at position 7
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(7);
    }).pipe(runtime.runPromise);
  });

  it("dedents block to become sibling of parent when Shift+Tab pressed", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 0);

      const Node = yield* NodeT;
      const rootChildren = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(rootChildren[0]!, "First child");
      yield* Then.NODE_HAS_TEXT(rootChildren[1]!, "Second child");
    }).pipe(runtime.runPromise);
  });
});

describe("Block selection Tab key", () => {
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

  it("Tab indents all selected blocks under previous sibling (grouped)", async () => {
    await Effect.gen(function* () {
      // Given: root with 3 children A, B, C at same level
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select B and extend selection to C
      const blockB = Id.makeBlockId(bufferId, childNodeIds[1]);
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockB);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify B and C are selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[1],
        childNodeIds[2],
      ]);

      // When: User presses Tab
      yield* When.USER_PRESSES("{Tab}");

      // Then: Root should have only A, and A should have B and C as children
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 2);

      // Verify B and C are now children of A
      const Node = yield* NodeT;
      const aChildren = yield* Node.getNodeChildren(childNodeIds[0]);
      yield* Then.NODE_HAS_TEXT(aChildren[0]!, "B");
      yield* Then.NODE_HAS_TEXT(aChildren[1]!, "C");

      // Selection should be preserved
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[1],
        childNodeIds[2],
      ]);
    }).pipe(runtime.runPromise);
  });

  it("Shift+Tab outdents all selected blocks to parent's level", async () => {
    await Effect.gen(function* () {
      // Given: root with 3 children A, B, C - we'll indent B,C first, then outdent
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // First, indent B and C under A (setup for outdent test)
      const blockB = Id.makeBlockId(bufferId, childNodeIds[1]);
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockB);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Tab}");

      // Verify B and C are now children of A
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 2);

      // Now outdent: B and C are still selected, press Shift+Tab
      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      // Then: A should have no children, root should have A, B, C as children again
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 3);

      // Verify order: A, B, C (B and C moved after A)
      const Node = yield* NodeT;
      const rootChildren = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(rootChildren[0]!, "A");
      yield* Then.NODE_HAS_TEXT(rootChildren[1]!, "B");
      yield* Then.NODE_HAS_TEXT(rootChildren[2]!, "C");
    }).pipe(runtime.runPromise);
  });

  it("Tab does nothing when first selected block has no previous sibling", async () => {
    await Effect.gen(function* () {
      // Given: root with 2 children A, B
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
        ]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select A (first child) and extend to B
      const blockA = Id.makeBlockId(bufferId, childNodeIds[0]);
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify A and B are selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[0],
        childNodeIds[1],
      ]);

      // When: User presses Tab (should do nothing - A is first child)
      yield* When.USER_PRESSES("{Tab}");

      // Then: Structure unchanged - root still has both children
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      // Selection should be preserved
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [
        childNodeIds[0],
        childNodeIds[1],
      ]);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure before:
   * - Root
   *   - A (collapsed, has child B)
   *     - B
   *   - C
   *
   * User focuses C and presses Tab to indent.
   * A auto-expands after Tab so C remains visible.
   */
  it("auto-expands collapsed parent when indenting single block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "C" },
        ]);

      const [nodeA, nodeC] = childNodeIds;

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });

      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockC = Id.makeBlockId(bufferId, nodeC);

      render(() => <EditorBuffer bufferId={bufferId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);

      yield* When.USER_CLICKS_BLOCK(blockC);
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(nodeA, 2);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure before:
   * - Root
   *   - A (collapsed, has child B)
   *     - B
   *   - C
   *   - D
   *
   * User selects C and D in block selection mode, presses Tab.
   * A auto-expands so C and D remain visible.
   */
  it("auto-expands collapsed parent when indenting selected blocks", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "C" },
          { text: "D" },
        ]);

      const [nodeA, nodeC] = childNodeIds;

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });

      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockC = Id.makeBlockId(bufferId, nodeC);

      render(() => <EditorBuffer bufferId={bufferId} />);

      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);

      yield* When.USER_ENTERS_BLOCK_SELECTION(blockC);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(nodeA, 3);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
    }).pipe(runtime.runPromise);
  });
});
