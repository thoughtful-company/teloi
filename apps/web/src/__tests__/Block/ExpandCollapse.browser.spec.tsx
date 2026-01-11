import "@/index.css";
import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import EditorBuffer from "@/ui/EditorBuffer";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { screen, waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block expand/collapse - Text editing mode", () => {
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

  it("Cmd+Up collapses an expanded block that has children", async () => {
    await Effect.gen(function* () {
      // Given: A block with children, user focused in it
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the parent block (text editing mode)
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // Verify initially expanded (default state)
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Block collapses
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up does nothing on already collapsed block", async () => {
    await Effect.gen(function* () {
      // Given: A collapsed block with children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block first
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Block stays collapsed
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up does nothing on block with no children", async () => {
    await Effect.gen(function* () {
      // Given: A block with no children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Leaf" }]);

      const leafNodeId = childNodeIds[0];
      const leafBlockId = Id.makeBlockId(bufferId, leafNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the leaf block
      yield* When.USER_CLICKS_BLOCK(leafBlockId);

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Nothing happens (no error, block still exists)
      yield* Then.TEXT_IS_VISIBLE("Leaf");
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down expands a collapsed block that has children", async () => {
    await Effect.gen(function* () {
      // Given: A collapsed block with children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block first
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Block expands
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down does nothing on already expanded block", async () => {
    await Effect.gen(function* () {
      // Given: An expanded block with children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify initially expanded
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Block stays expanded
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down on expanded block expands first collapsed child with children", async () => {
    await Effect.gen(function* () {
      // Given: Parent is expanded, has child "A" which has grandchild
      // Child A is collapsed
      // User is focused on parent
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add Child A to the parent
      const childANodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child A",
      });
      const childABlockId = Id.makeBlockId(bufferId, childANodeId);

      // Add grandchild to Child A (so Child A is expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childANodeId,
        insert: "after",
        text: "Grandchild",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render
      yield* Then.TEXT_IS_VISIBLE("Child A");

      // Collapse Child A
      const Block = yield* BlockT;
      yield* Block.setExpanded(childABlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(childABlockId);

      // Verify parent is expanded
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Focus on the parent block by clicking its text content
      // Note: Using direct click instead of USER_CLICKS_BLOCK due to selector
      // issue with chevron button being first child
      yield* Effect.promise(async () => {
        const parentText = await waitFor(() => screen.getByText("Parent"));
        await userEvent.click(parentText);
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Child A gets expanded (drill down behavior)
      yield* Then.BLOCK_IS_EXPANDED(childABlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down does nothing on block with no children", async () => {
    await Effect.gen(function* () {
      // Given: A block with no children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Leaf" }]);

      const leafNodeId = childNodeIds[0];
      const leafBlockId = Id.makeBlockId(bufferId, leafNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the leaf block
      yield* When.USER_CLICKS_BLOCK(leafBlockId);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Nothing happens (no error, block still exists)
      yield* Then.TEXT_IS_VISIBLE("Leaf");
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up on collapsed first-level block moves focus to title", async () => {
    await Effect.gen(function* () {
      // Given: A first-level block that is collapsed (has a child)
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to make it collapsible
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the first-level block
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Focus on the first-level block by clicking its text
      yield* Effect.promise(async () => {
        const parentText = await waitFor(() => screen.getByText("Parent"));
        await userEvent.click(parentText);
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Focus moves to Title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up on collapsed block collapses parent and moves focus to parent", async () => {
    await Effect.gen(function* () {
      // Given: Parent has child "A", Child A has grandchild
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add Child A to Parent
      const childANodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child A",
      });
      const childABlockId = Id.makeBlockId(bufferId, childANodeId);

      // Add grandchild to Child A (so Child A is expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childANodeId,
        insert: "after",
        text: "Grandchild",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render
      yield* Then.TEXT_IS_VISIBLE("Child A");

      // Collapse Child A first
      const Block = yield* BlockT;
      yield* Block.setExpanded(childABlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(childABlockId);

      // Focus on Child A by clicking its text content
      yield* Effect.promise(async () => {
        const childAText = await waitFor(() => screen.getByText("Child A"));
        await userEvent.click(childAText);
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Parent gets collapsed
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Then: Focus moves to Parent (cursor is in Parent's text editor)
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });
});

describe("Block expand/collapse - Block selection mode (single block)", () => {
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

  it("Cmd+Up collapses selected block and preserves selection", async () => {
    await Effect.gen(function* () {
      // Given: A block with children is selected in block selection mode
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Block collapses AND selection is preserved
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down expands selected block and preserves selection", async () => {
    await Effect.gen(function* () {
      // Given: A collapsed block with children is selected
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block first
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Block expands AND selection is preserved
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
    }).pipe(runtime.runPromise);
  });
});

describe("Block expand/collapse - Block selection mode (multiple blocks)", () => {
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

  it("Cmd+Up collapses all expandable selected blocks", async () => {
    await Effect.gen(function* () {
      // Given: Multiple blocks are selected, some with children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      const [nodeA, nodeB, nodeC] = childNodeIds;
      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add children to A and B (C has no children)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select A, B, C in block selection mode
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA, nodeB, nodeC]);

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: A and B are collapsed (they have children), C is unaffected
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down expands all collapsible selected blocks", async () => {
    await Effect.gen(function* () {
      // Given: Multiple collapsed blocks are selected
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      const [nodeA, nodeB, nodeC] = childNodeIds;
      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add children to A and B (C has no children)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse A and B first
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Select A, B, C in block selection mode
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA, nodeB, nodeC]);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: A and B are expanded (they have children), C is unaffected
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);
    }).pipe(runtime.runPromise);
  });
});

describe("Title expand/collapse", () => {
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

  it("Cmd+Down on title expands all first-level nodes with children", async () => {
    await Effect.gen(function* () {
      // Given: Buffer with 3 first-level nodes: A (has child, expanded), B (has child, collapsed), C (no children)
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      const [nodeA, nodeB, _nodeC] = childNodeIds;
      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add child to A (so A is expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });

      // Add child to B (so B is expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      // C has no children (leaf node)

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render
      yield* Then.TEXT_IS_VISIBLE("A");
      yield* Then.TEXT_IS_VISIBLE("B");
      yield* Then.TEXT_IS_VISIBLE("C");

      // Set B to collapsed (A stays expanded by default)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Focus on Title
      yield* When.USER_CLICKS_TITLE(bufferId);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Both A and B are expanded
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);

      // C is unaffected (no children) - no assertion needed
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up on title collapses all first-level nodes with children", async () => {
    await Effect.gen(function* () {
      // Given: Buffer with 2 first-level nodes with children, both expanded
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
        ]);

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add children to make them expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child of A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Child of B",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify both are expanded by default
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);

      // Focus on Title
      yield* When.USER_CLICKS_TITLE(bufferId);

      // When: Cmd+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Both A and B are collapsed
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down on title drills down level by level", async () => {
    await Effect.gen(function* () {
      // Given: 3-level hierarchy
      // Root -> A (has child A1) -> A1 (has child A1a)
      // A and A1 are collapsed initially
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "A" }]);

      const nodeA = childNodeIds[0];
      const blockA = Id.makeBlockId(bufferId, nodeA);

      // Add A1 as child of A
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const blockA1 = Id.makeBlockId(bufferId, nodeA1);

      // Add A1a as child of A1 (leaf node)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render
      yield* Then.TEXT_IS_VISIBLE("A");

      // Collapse A and A1 (both have children)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Block.setExpanded(blockA1, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockA1);

      // Focus on Title
      yield* When.USER_CLICKS_TITLE(bufferId);

      // First Cmd+Down: A expands (first-level), A1 stays collapsed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockA1);

      // Second Cmd+Down: A1 expands (second-level)
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");
      yield* Then.BLOCK_IS_EXPANDED(blockA1);

      // A1a is visible (leaf, no more drilling)
      yield* Then.TEXT_IS_VISIBLE("A1a");
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up on title collapses from deepest level up", async () => {
    await Effect.gen(function* () {
      // Given: 3-level hierarchy, all expanded
      // Root -> A -> C -> X (leaf)
      //            -> D (leaf)
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "A" }]);

      const nodeA = childNodeIds[0];
      const blockA = Id.makeBlockId(bufferId, nodeA);

      // Add C as child of A (C will have a child, so it's expandable)
      const nodeC = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "C",
      });
      const blockC = Id.makeBlockId(bufferId, nodeC);

      // Add D as child of A (D is a leaf)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "D",
      });

      // Add X as child of C (X is a leaf, makes C expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeC,
        insert: "after",
        text: "X",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render
      yield* Then.TEXT_IS_VISIBLE("A");
      yield* Then.TEXT_IS_VISIBLE("C");
      yield* Then.TEXT_IS_VISIBLE("D");
      yield* Then.TEXT_IS_VISIBLE("X");

      // Verify both A and C are expanded (default state)
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockC);

      // Focus on Title
      yield* When.USER_CLICKS_TITLE(bufferId);

      // First Cmd+Up: C collapses (its only child X is a leaf)
      // A should stay expanded (its child C still has children, even though collapsed)
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");
      yield* Then.BLOCK_IS_COLLAPSED(blockC);
      yield* Then.BLOCK_IS_EXPANDED(blockA);

      // Second Cmd+Up: A collapses (its children C and D - C is now collapsed, D is leaf)
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
    }).pipe(runtime.runPromise);
  });
});
