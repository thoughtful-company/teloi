import "@/index.css";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { userEvent } from "@vitest/browser/context";
import { Effect, Option } from "effect";
import { screen, waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

/**
 * =============================================================================
 * Progressive Mod+Up Behavior (NEW)
 * =============================================================================
 *
 * Mod+Up works in BOTH text editing mode AND block selection mode:
 *
 * | State                                    | Action                          |
 * |------------------------------------------|----------------------------------|
 * | Block is expanded (has visible children) | Collapse the block, stay on it   |
 * | Block is collapsed OR has no children    | Navigate to parent block         |
 * | At root level (parent is buffer)         | Focus title                      |
 *
 * Mode preservation: If in text editing mode, stay in text editing mode after
 * navigation. Same for block selection mode.
 */
describe("Progressive Mod+Up - Text editing mode", () => {
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

  it("Mod+Up on expanded block collapses it and stays on the block", async () => {
    await Effect.gen(function* () {
      // Given: A block with children (expanded by default), user focused in it
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to make the parent expandable
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

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Block collapses but stays selected
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on collapsed block navigates to parent", async () => {
    await Effect.gen(function* () {
      // Given: A collapsed block with children, nested under root
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the child (it has no children, so it's like being collapsed)
      // Actually, the child has no children so it can't be expanded/collapsed
      // Focus on the child block
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      // When: Mod+Up pressed (child is childless, so navigate to parent)
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection moves to parent block and parent is collapsed
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on childless block navigates to parent", async () => {
    await Effect.gen(function* () {
      // Given: A nested hierarchy: Root -> Parent -> Child (leaf)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child (leaf node, no children)
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Leaf",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the leaf block
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection moves to parent and parent is collapsed
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on root block (collapsed) focuses title", async () => {
    await Effect.gen(function* () {
      // Given: A root-level block that is collapsed
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "TopLevel" }],
      );

      const rootBlockNodeId = childNodeIds[0];
      const rootBlockId = Id.makeBlockId(bufferId, rootBlockNodeId);

      // Add a child to make it collapsible
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: rootBlockNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block
      const Block = yield* BlockT;
      yield* Block.setExpanded(rootBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(rootBlockId);

      // Focus on the root-level block
      yield* When.USER_CLICKS_BLOCK(rootBlockId);

      // When: Mod+Up pressed (block is collapsed, at root level)
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Focus moves to title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on root block (childless) focuses title", async () => {
    await Effect.gen(function* () {
      // Given: A root-level block with no children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "LeafRoot" }],
      );

      const rootBlockNodeId = childNodeIds[0];
      const rootBlockId = Id.makeBlockId(bufferId, rootBlockNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the root-level block (no children)
      yield* When.USER_CLICKS_BLOCK(rootBlockId);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Focus moves to title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up preserves text editing mode after navigation", async () => {
    await Effect.gen(function* () {
      // Given: Parent -> Child, focused on child in text editing mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on child (text editing mode - CodeMirror focused)
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      // Verify we're in text editing mode (CodeMirror is focused)
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection is on parent, parent is collapsed, and still in text editing mode
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // CodeMirror should still be focused (text editing mode preserved)
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor)
            throw new Error("CodeMirror not focused after navigation");
        }),
      );
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up preserves goalX when navigating to parent", async () => {
    await Effect.gen(function* () {
      const Buffer = yield* BufferT;

      // Given: Parent -> Child with text "Hello world"
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Hello world",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on child block (text editing mode)
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Position cursor in the middle of the text (offset 6 = after "Hello ")
      yield* When.USER_PRESSES("{Home}");
      for (let i = 0; i < 6; i++) {
        yield* When.USER_PRESSES("{ArrowRight}");
      }

      // Press ArrowUp to establish goalX (this sets goalX in the model)
      yield* When.USER_PRESSES("{ArrowUp}");

      // Verify we're now on the parent (ArrowUp navigated from child to parent)
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);

      // Record the goalX before Mod+Up
      const selectionBefore = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selectionBefore)).toBe(true);
      const goalXBefore = Option.getOrThrow(selectionBefore).goalX;
      expect(
        goalXBefore,
        "goalX should be set after vertical navigation",
      ).not.toBeNull();

      // Navigate back to child to test Mod+Up
      yield* When.USER_PRESSES("{ArrowDown}");
      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);

      // Verify goalX is still preserved after ArrowDown
      const selectionAfterDown = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selectionAfterDown)).toBe(true);
      const goalXAfterDown = Option.getOrThrow(selectionAfterDown).goalX;
      expect(goalXAfterDown, "goalX should be preserved after ArrowDown").toBe(
        goalXBefore,
      );

      // When: Mod+Up pressed (navigates to parent since child has no children)
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection is on parent and goalX is preserved
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      const selectionAfter = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selectionAfter)).toBe(true);
      const goalXAfter = Option.getOrThrow(selectionAfter).goalX;
      expect(
        goalXAfter,
        "goalX should be preserved after Mod+Up navigation",
      ).toBe(goalXBefore);
    }).pipe(runtime.runPromise);
  });
});

describe("Progressive Mod+Up - Block selection mode", () => {
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

  it("Mod+Up on expanded block collapses it and stays selected", async () => {
    await Effect.gen(function* () {
      // Given: An expanded block with children, selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Block collapses and stays selected in block selection mode
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on collapsed block navigates to parent in block selection mode", async () => {
    await Effect.gen(function* () {
      // Given: Parent -> Child, child is collapsed, selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];

      // Add a child with its own child (so it can be collapsed)
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      // Add grandchild to make child collapsible
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeId,
        insert: "after",
        text: "Grandchild",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the child block
      const Block = yield* BlockT;
      yield* Block.setExpanded(childBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(childBlockId);

      // Enter block selection mode on child
      yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeId]);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection moves to parent in block selection mode and parent is collapsed
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on childless block navigates to parent in block selection mode", async () => {
    await Effect.gen(function* () {
      // Given: Parent -> Child (leaf), child selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Leaf",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on child (leaf)
      yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeId]);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection moves to parent in block selection mode and parent is collapsed
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on root block (collapsed) focuses title", async () => {
    await Effect.gen(function* () {
      // Given: A root-level collapsed block, selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "TopLevel" }],
      );

      const rootBlockNodeId = childNodeIds[0];
      const rootBlockId = Id.makeBlockId(bufferId, rootBlockNodeId);

      // Add a child to make it collapsible
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: rootBlockNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block
      const Block = yield* BlockT;
      yield* Block.setExpanded(rootBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(rootBlockId);

      // Enter block selection mode
      yield* When.USER_ENTERS_BLOCK_SELECTION(rootBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [rootBlockNodeId]);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Focus moves to title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up on root block (childless) focuses title", async () => {
    await Effect.gen(function* () {
      // Given: A root-level childless block, selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "LeafRoot" }],
      );

      const rootBlockNodeId = childNodeIds[0];
      const rootBlockId = Id.makeBlockId(bufferId, rootBlockNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode
      yield* When.USER_ENTERS_BLOCK_SELECTION(rootBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [rootBlockNodeId]);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Focus moves to title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Up preserves block selection mode after navigation", async () => {
    await Effect.gen(function* () {
      // Given: Parent -> Child, child selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];

      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on child
      yield* When.USER_ENTERS_BLOCK_SELECTION(childBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeId]);

      // When: Mod+Up pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: Selection moves to parent, parent is collapsed, and stays in block selection mode
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Verify we're still in block selection mode (not text editing)
      // In block selection mode, CodeMirror should NOT be focused
      yield* Effect.sync(() => {
        const cmEditor = document.querySelector(".cm-editor.cm-focused");
        expect(cmEditor).toBeNull();
      });
    }).pipe(runtime.runPromise);
  });
});

// =============================================================================
// LEGACY TESTS - TO BE MODIFIED OR REMOVED
// =============================================================================
// The tests below test the OLD Cmd+Up behavior which only collapsed blocks.
// With the new progressive behavior:
// - "Cmd+Up does nothing on already collapsed block" -> REMOVE (now navigates to parent)
// - "Cmd+Up does nothing on block with no children" -> REMOVE (now navigates to parent)
// The first test "Cmd+Up collapses an expanded block" remains valid.
// =============================================================================

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
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

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

  it("Cmd+Down expands a collapsed block that has children", async () => {
    await Effect.gen(function* () {
      // Given: A collapsed block with children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

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
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

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
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

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

  it("Cmd+Down expands only the selected block on first press", async () => {
    await Effect.gen(function* () {
      // Given: A -> B (collapsed), B -> C (collapsed)
      // A is selected in block selection mode, both A and B are collapsed
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeBlockId(bufferId, nodeA);

      // Add B as child of A
      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add C as child of B (makes B expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "C",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render (A expanded by default, so B and C mount)
      yield* Then.TEXT_IS_VISIBLE("B");
      yield* Then.TEXT_IS_VISIBLE("C");

      // Now collapse both A and B
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Wait for DOM to update after collapse (B should no longer be visible since A is collapsed)
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const bText = document.body.textContent;
            if (bText?.includes("B"))
              throw new Error("B should be hidden when A is collapsed");
          },
          { timeout: 2000 },
        ),
      );

      // Click on A text to focus it
      yield* Effect.promise(async () => {
        const aText = await waitFor(() => screen.getByText("A"));
        await userEvent.click(aText);
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Press Escape to enter block selection mode
      yield* When.USER_PRESSES("{Escape}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA]);

      // When: Cmd+Down pressed once
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: A expanded, B still collapsed
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Down expands children on second press", async () => {
    await Effect.gen(function* () {
      // Given: A -> B (collapsed), B -> C, A is expanded
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeBlockId(bufferId, nodeA);

      // Add B as child of A
      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add C as child of B (makes B expandable)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "C",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render (A expanded by default, so B and C mount)
      yield* Then.TEXT_IS_VISIBLE("B");
      yield* Then.TEXT_IS_VISIBLE("C");

      // Collapse B (A stays expanded)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Wait for DOM to update (C should be hidden since B is collapsed)
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const bodyText = document.body.textContent;
            if (bodyText?.includes("C"))
              throw new Error("C should be hidden when B is collapsed");
          },
          { timeout: 2000 },
        ),
      );

      // Click on A text to focus it
      yield* Effect.promise(async () => {
        const aText = await waitFor(() => screen.getByText("A"));
        await userEvent.click(aText);
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Press Escape to enter block selection mode
      yield* When.USER_PRESSES("{Escape}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA]);

      // When: Cmd+Down pressed once (A already expanded, should expand B)
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: B expanded (one level deeper)
      yield* Then.BLOCK_IS_EXPANDED(blockB);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up collapses the block itself when no expanded descendants", async () => {
    await Effect.gen(function* () {
      // Given: A -> B -> C, where B is collapsed (no expanded descendants under A)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeBlockId(bufferId, nodeA);

      // Add B as child of A
      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add C as child of B (makes B expandable/collapsible)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "C",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render (A and B expanded by default)
      yield* Then.TEXT_IS_VISIBLE("B");
      yield* Then.TEXT_IS_VISIBLE("C");

      // Collapse B (so A has no expanded descendants)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockB, false);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_COLLAPSED(blockB);

      // Wait for DOM to update (C should be hidden since B is collapsed)
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const bodyText = document.body.textContent;
            if (bodyText?.includes("C"))
              throw new Error("C should be hidden when B is collapsed");
          },
          { timeout: 2000 },
        ),
      );

      // Click on A text to focus it
      yield* Effect.promise(async () => {
        const aText = await waitFor(() => screen.getByText("A"));
        await userEvent.click(aText);
      });

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Press Escape to enter block selection mode
      yield* When.USER_PRESSES("{Escape}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA]);

      // When: Cmd+Up pressed once
      yield* When.USER_PRESSES("{Meta>}{ArrowUp}{/Meta}");

      // Then: A collapsed (no expanded descendants, so collapse itself)
      yield* Then.BLOCK_IS_COLLAPSED(blockA);
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

  it("Cmd+Down expands all collapsible selected blocks", async () => {
    await Effect.gen(function* () {
      // Given: Multiple collapsed blocks are selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }],
      );

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

/**
 * =============================================================================
 * Progressive Mod+Down Behavior (NEW)
 * =============================================================================
 *
 * Mod+Down works in BOTH text editing mode AND block selection mode:
 *
 * | State                                    | Action                          |
 * |------------------------------------------|----------------------------------|
 * | Block is collapsed (has children)        | Expand the block, stay on it     |
 * | Block is expanded (has visible children) | Expand children one level deeper |
 * | Block has no children                    | Create child and focus it        |
 *
 * Mode preservation: If in text editing mode, stay in text editing mode after
 * the action. Same for block selection mode.
 */
describe("Progressive Mod+Down - Text editing mode", () => {
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

  it("Mod+Down on childless block creates a child and focuses it", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Given: A block with NO children, user focused in it (text editing mode)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Childless" }],
      );

      const childlessNodeId = childNodeIds[0];
      const childlessBlockId = Id.makeBlockId(bufferId, childlessNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify the node has no children initially
      const childrenBefore = yield* Node.getNodeChildren(childlessNodeId);
      expect(childrenBefore.length).toBe(0);

      // Focus on the childless block (text editing mode)
      yield* When.USER_CLICKS_BLOCK(childlessBlockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // When: Mod+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: A child was created
      const childrenAfter = yield* Node.getNodeChildren(childlessNodeId);
      expect(childrenAfter.length).toBe(1);

      // And: Focus moved to the new child
      const newChildNodeId = childrenAfter[0]!;
      const newChildBlockId = Id.makeBlockId(bufferId, newChildNodeId);
      yield* Then.SELECTION_IS_ON_BLOCK(newChildBlockId);

      // And: Still in text editing mode (CodeMirror focused)
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor)
            throw new Error("CodeMirror not focused after child creation");
        }),
      );
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down on collapsed block with children expands it (does not create child)", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Given: A collapsed block with existing children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Existing Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block first
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Record children count before
      const childrenBefore = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenBefore.length).toBe(1);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Mod+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Block expands (does NOT create new child)
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Verify no new child was created
      const childrenAfter = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenAfter.length).toBe(1);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down on expanded block with children does not create more children", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Given: An expanded block with one existing child (simple case)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent (leaf node, no grandchild)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Existing Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for render
      yield* Then.TEXT_IS_VISIBLE("Existing Child");

      // Verify parent is expanded (default state)
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Record children count before
      const childrenBefore = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenBefore.length).toBe(1);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Mod+Down pressed (parent already expanded with children)
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: No new child was created on parent (existing behavior is expand/drill-down, not create)
      const childrenAfter = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenAfter.length).toBe(1);
    }).pipe(runtime.runPromise);
  });
});

describe("Progressive Mod+Down - Block selection mode", () => {
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

  it("Mod+Down on childless block creates a child and focuses it", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Given: A block with NO children, selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Childless" }],
      );

      const childlessNodeId = childNodeIds[0];
      const childlessBlockId = Id.makeBlockId(bufferId, childlessNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify the node has no children initially
      const childrenBefore = yield* Node.getNodeChildren(childlessNodeId);
      expect(childrenBefore.length).toBe(0);

      // Enter block selection mode on the childless block
      yield* When.USER_ENTERS_BLOCK_SELECTION(childlessBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childlessNodeId]);

      // When: Mod+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: A child was created
      const childrenAfter = yield* Node.getNodeChildren(childlessNodeId);
      expect(childrenAfter.length).toBe(1);

      // And: Focus moved to the new child (in text editing mode to allow typing)
      const newChildNodeId = childrenAfter[0]!;
      const newChildBlockId = Id.makeBlockId(bufferId, newChildNodeId);
      yield* Then.SELECTION_IS_ON_BLOCK(newChildBlockId);

      // New child should be focused in text editing mode (CodeMirror)
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor)
            throw new Error("CodeMirror not focused for new child");
        }),
      );
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down on collapsed block with children expands it (does not create child)", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Given: A collapsed block with existing children, in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to the parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Existing Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the block first
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Record children count before
      const childrenBefore = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenBefore.length).toBe(1);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // When: Mod+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Block expands AND selection is preserved (does NOT create new child)
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // Verify no new child was created
      const childrenAfter = yield* Node.getNodeChildren(parentNodeId);
      expect(childrenAfter.length).toBe(1);
    }).pipe(runtime.runPromise);
  });

  it("Mod+Down on multiple selected childless blocks creates children for each", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Given: Multiple childless blocks selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeBlockId(bufferId, nodeA);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify both nodes have no children
      expect((yield* Node.getNodeChildren(nodeA)).length).toBe(0);
      expect((yield* Node.getNodeChildren(nodeB)).length).toBe(0);

      // Select both blocks in block selection mode
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA, nodeB]);

      // When: Mod+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Both blocks now have children
      const childrenA = yield* Node.getNodeChildren(nodeA);
      const childrenB = yield* Node.getNodeChildren(nodeB);
      expect(childrenA.length).toBe(1);
      expect(childrenB.length).toBe(1);
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
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }, { text: "C" }],
      );

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

  it("Cmd+Down on title drills down level by level", async () => {
    await Effect.gen(function* () {
      // Given: 3-level hierarchy
      // Root -> A (has child A1) -> A1 (has child A1a)
      // A and A1 are collapsed initially
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

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
});

/**
 * Tests for auto-expanding ancestor blocks when selection is set.
 *
 * When selection (text or block) is set to a node, we need to expand all
 * ancestor blocks between the buffer's assignedNodeId (excluded) and
 * target node(s) (excluded). This ensures selected nodes are always visible.
 */
describe("Auto-expand ancestors on selection", () => {
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

  describe("Text selection", () => {
    it("expands collapsed parent when setting text selection to child node", async () => {
      await Effect.gen(function* () {
        // Given: Root -> Parent -> Child, where Parent is collapsed
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }],
        );

        const parentNodeId = childNodeIds[0];
        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        // Create Child under Parent
        const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child content",
        });

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Verify Parent initially expanded (default state)
        yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

        // Collapse the Parent
        const Block = yield* BlockT;
        yield* Block.setExpanded(parentBlockId, false);
        yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

        // When: Set text selection to the Child node
        const Buffer = yield* BufferT;
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: childNodeId },
            anchorOffset: 0,
            focus: { nodeId: childNodeId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        // Then: Parent should be expanded so Child is visible
        yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
      }).pipe(runtime.runPromise);
    });

    it("expands multiple collapsed ancestors for deeply nested node", async () => {
      await Effect.gen(function* () {
        // Given: Root -> A -> B -> C (deeply nested)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }],
        );

        const nodeA = childNodeIds[0];
        const blockA = Id.makeBlockId(bufferId, nodeA);

        // Create B as child of A
        const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "B",
        });
        const blockB = Id.makeBlockId(bufferId, nodeB);

        // Create C as child of B
        const nodeC = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeB,
          insert: "after",
          text: "C",
        });

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Collapse both A and B
        const Block = yield* BlockT;
        yield* Block.setExpanded(blockA, false);
        yield* Block.setExpanded(blockB, false);
        yield* Then.BLOCK_IS_COLLAPSED(blockA);
        yield* Then.BLOCK_IS_COLLAPSED(blockB);

        // When: Set text selection to C (deeply nested)
        const Buffer = yield* BufferT;
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: nodeC },
            anchorOffset: 0,
            focus: { nodeId: nodeC },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        // Then: Both A and B should be expanded so C is visible
        yield* Then.BLOCK_IS_EXPANDED(blockA);
        yield* Then.BLOCK_IS_EXPANDED(blockB);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Block selection", () => {
    it("expands collapsed parent when setting block selection to child", async () => {
      await Effect.gen(function* () {
        // Given: Root -> Parent -> Child, where Parent is collapsed
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }],
        );

        const parentNodeId = childNodeIds[0];
        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        // Create Child under Parent
        const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child content",
        });

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Collapse the Parent
        const Block = yield* BlockT;
        yield* Block.setExpanded(parentBlockId, false);
        yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

        // When: Set block selection to the Child node
        const Buffer = yield* BufferT;
        yield* Buffer.setBlockSelection(
          bufferId,
          [childNodeId],
          childNodeId,
          childNodeId,
        );

        // Then: Parent should be expanded so Child is visible
        yield* Then.BLOCK_IS_EXPANDED(parentBlockId);
      }).pipe(runtime.runPromise);
    });

    it("expands all necessary ancestors for multiple nodes at different depths", async () => {
      await Effect.gen(function* () {
        // Given: Root -> A -> A1, Root -> B -> B1 -> B1a
        // Both paths have collapsed ancestors
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );

        const [nodeA, nodeB] = childNodeIds;
        const blockA = Id.makeBlockId(bufferId, nodeA);
        const blockB = Id.makeBlockId(bufferId, nodeB);

        // Create A1 under A
        const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "A1",
        });

        // Create B1 under B
        const nodeB1 = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeB,
          insert: "after",
          text: "B1",
        });
        const blockB1 = Id.makeBlockId(bufferId, nodeB1);

        // Create B1a under B1
        const nodeB1a = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeB1,
          insert: "after",
          text: "B1a",
        });

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Collapse A, B, and B1
        const Block = yield* BlockT;
        yield* Block.setExpanded(blockA, false);
        yield* Block.setExpanded(blockB, false);
        yield* Block.setExpanded(blockB1, false);
        yield* Then.BLOCK_IS_COLLAPSED(blockA);
        yield* Then.BLOCK_IS_COLLAPSED(blockB);
        yield* Then.BLOCK_IS_COLLAPSED(blockB1);

        // When: Set block selection to A1 and B1a (different depths)
        const Buffer = yield* BufferT;
        yield* Buffer.setBlockSelection(
          bufferId,
          [nodeA1, nodeB1a],
          nodeA1,
          nodeB1a,
        );

        // Then: All necessary ancestors should be expanded
        // A expanded (for A1)
        yield* Then.BLOCK_IS_EXPANDED(blockA);
        // B and B1 expanded (for B1a)
        yield* Then.BLOCK_IS_EXPANDED(blockB);
        yield* Then.BLOCK_IS_EXPANDED(blockB1);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Edge cases", () => {
    it("does not expand anything when selecting direct child of buffer root", async () => {
      await Effect.gen(function* () {
        // Given: Root -> Child (direct child, no ancestors to expand)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Direct child" }],
        );

        const childNodeId = childNodeIds[0];

        render(() => <EditorBuffer bufferId={bufferId} />);

        // When: Set text selection to direct child
        const Buffer = yield* BufferT;
        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: childNodeId },
            anchorOffset: 0,
            focus: { nodeId: childNodeId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        // Then: No crash, selection is set (no ancestors to expand between root and direct child)
        // This test mainly ensures we don't have off-by-one errors
        const selection = yield* Buffer.getSelection(bufferId);
        expect(Option.isSome(selection)).toBe(true);
        expect(Option.getOrThrow(selection).anchor.nodeId).toBe(childNodeId);
      }).pipe(runtime.runPromise);
    });

    it("does not expand anything when clearing selection (null)", async () => {
      await Effect.gen(function* () {
        // Given: Root -> Parent -> Child, Parent collapsed
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }],
        );

        const parentNodeId = childNodeIds[0];
        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        // Create Child under Parent
        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child content",
        });

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Collapse the Parent
        const Block = yield* BlockT;
        yield* Block.setExpanded(parentBlockId, false);
        yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

        // When: Clear selection (set to None)
        const Buffer = yield* BufferT;
        yield* Buffer.setSelection(bufferId, Option.none());

        // Then: Parent should remain collapsed (no expansion on clear)
        yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);
      }).pipe(runtime.runPromise);
    });
  });
});

/**
 * Tests for expand/collapse triangle vertical positioning.
 *
 * The triangle should be vertically centered relative to the first line of
 * the block content. When a block has a header type (H1/H2/H3), the line
 * height is larger than the default --text-block line height, so the
 * triangle positioning needs to adjust accordingly.
 */
describe("Expand/collapse triangle positioning", () => {
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
   * Helper to get the vertical center of an element.
   */
  const getVerticalCenter = (el: Element): number => {
    const rect = el.getBoundingClientRect();
    return rect.top + rect.height / 2;
  };

  /**
   * Helper to get the vertical center of the first line of text content.
   * Looks for the <p> element that contains the styled text, then calculates
   * the first line center based on its computed line height.
   */
  const getFirstLineVerticalCenter = (contentEl: Element): number => {
    // The text styling (including header-specific line heights) is applied to
    // the <p> element inside the content area
    const textEl = contentEl.querySelector("p");
    if (!textEl) {
      // Fallback if no <p> found (e.g., when CodeMirror is active)
      const rect = contentEl.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(contentEl);
      const lineHeight = parseFloat(computedStyle.lineHeight);
      return rect.top + lineHeight / 2;
    }

    const rect = textEl.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textEl);
    const lineHeight = parseFloat(computedStyle.lineHeight);
    return rect.top + lineHeight / 2;
  };

  it("triangle aligns with first line of default block text", async () => {
    await Effect.gen(function* () {
      // Given: A block with children (so triangle appears)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent block" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add a child to make the parent expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for the block and its child to render (child presence triggers triangle)
      yield* Then.TEXT_IS_VISIBLE("Parent block");
      yield* Then.TEXT_IS_VISIBLE("Child block");

      // Find the triangle button and content area
      const { triangleButton, contentArea } = yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${parentBlockId}"]`,
            );
            if (!blockEl) throw new Error("Block not found");

            const button = blockEl.querySelector("button");
            if (!button) throw new Error("Triangle button not found");

            const content = blockEl.querySelector("[data-block-content]");
            if (!content) throw new Error("Content area not found");

            return { triangleButton: button, contentArea: content };
          },
          { timeout: 2000 },
        ),
      );

      // Get the vertical centers
      const triangleCenter = getVerticalCenter(triangleButton);
      const firstLineCenter = getFirstLineVerticalCenter(contentArea);

      // They should be aligned within 2 pixels (accounting for rounding)
      const difference = Math.abs(triangleCenter - firstLineCenter);
      expect(
        difference,
        `Triangle center (${triangleCenter.toFixed(1)}px) should align with first line center (${firstLineCenter.toFixed(1)}px)`,
      ).toBeLessThan(2);
    }).pipe(runtime.runPromise);
  });

  it("triangle aligns with first line of H1 header block", async () => {
    await Effect.gen(function* () {
      const Type = yield* TypeT;

      // Given: A block with children and H1 type
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Header 1 Content" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add H1 type to the block
      yield* Type.addType(parentNodeId, System.HEADER_1);

      // Add a child to make the parent expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for the block and its child to render (child presence triggers triangle)
      yield* Then.TEXT_IS_VISIBLE("Header 1 Content");
      yield* Then.TEXT_IS_VISIBLE("Child block");

      // Find the triangle button and content area
      const { triangleButton, contentArea } = yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${parentBlockId}"]`,
            );
            if (!blockEl) throw new Error("Block not found");

            const button = blockEl.querySelector("button");
            if (!button) throw new Error("Triangle button not found");

            const content = blockEl.querySelector("[data-block-content]");
            if (!content) throw new Error("Content area not found");

            return { triangleButton: button, contentArea: content };
          },
          { timeout: 2000 },
        ),
      );

      // Get the vertical centers
      const triangleCenter = getVerticalCenter(triangleButton);
      const firstLineCenter = getFirstLineVerticalCenter(contentArea);

      // They should be aligned within 2 pixels
      const difference = Math.abs(triangleCenter - firstLineCenter);
      expect(
        difference,
        `Triangle center (${triangleCenter.toFixed(1)}px) should align with H1 first line center (${firstLineCenter.toFixed(1)}px). ` +
          `Difference of ${difference.toFixed(1)}px suggests triangle is using wrong line height.`,
      ).toBeLessThan(2);
    }).pipe(runtime.runPromise);
  });

  it("triangle aligns with first line of H2 header block", async () => {
    await Effect.gen(function* () {
      const Type = yield* TypeT;

      // Given: A block with children and H2 type
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Header 2 Content" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add H2 type to the block
      yield* Type.addType(parentNodeId, System.HEADER_2);

      // Add a child to make the parent expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for the block and its child to render (child presence triggers triangle)
      yield* Then.TEXT_IS_VISIBLE("Header 2 Content");
      yield* Then.TEXT_IS_VISIBLE("Child block");

      // Find the triangle button and content area
      const { triangleButton, contentArea } = yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${parentBlockId}"]`,
            );
            if (!blockEl) throw new Error("Block not found");

            const button = blockEl.querySelector("button");
            if (!button) throw new Error("Triangle button not found");

            const content = blockEl.querySelector("[data-block-content]");
            if (!content) throw new Error("Content area not found");

            return { triangleButton: button, contentArea: content };
          },
          { timeout: 2000 },
        ),
      );

      // Get the vertical centers
      const triangleCenter = getVerticalCenter(triangleButton);
      const firstLineCenter = getFirstLineVerticalCenter(contentArea);

      // They should be aligned within 2 pixels
      const difference = Math.abs(triangleCenter - firstLineCenter);
      expect(
        difference,
        `Triangle center (${triangleCenter.toFixed(1)}px) should align with H2 first line center (${firstLineCenter.toFixed(1)}px). ` +
          `Difference of ${difference.toFixed(1)}px suggests triangle is using wrong line height.`,
      ).toBeLessThan(2);
    }).pipe(runtime.runPromise);
  });

  it("triangle aligns with first line of H3 header block", async () => {
    await Effect.gen(function* () {
      const Type = yield* TypeT;

      // Given: A block with children and H3 type
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Header 3 Content" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add H3 type to the block
      yield* Type.addType(parentNodeId, System.HEADER_3);

      // Add a child to make the parent expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for the block and its child to render (child presence triggers triangle)
      yield* Then.TEXT_IS_VISIBLE("Header 3 Content");
      yield* Then.TEXT_IS_VISIBLE("Child block");

      // Find the triangle button and content area
      const { triangleButton, contentArea } = yield* Effect.promise(() =>
        waitFor(
          () => {
            const blockEl = document.querySelector(
              `[data-element-id="${parentBlockId}"]`,
            );
            if (!blockEl) throw new Error("Block not found");

            const button = blockEl.querySelector("button");
            if (!button) throw new Error("Triangle button not found");

            const content = blockEl.querySelector("[data-block-content]");
            if (!content) throw new Error("Content area not found");

            return { triangleButton: button, contentArea: content };
          },
          { timeout: 2000 },
        ),
      );

      // Get the vertical centers
      const triangleCenter = getVerticalCenter(triangleButton);
      const firstLineCenter = getFirstLineVerticalCenter(contentArea);

      // They should be aligned within 2 pixels
      const difference = Math.abs(triangleCenter - firstLineCenter);
      expect(
        difference,
        `Triangle center (${triangleCenter.toFixed(1)}px) should align with H3 first line center (${firstLineCenter.toFixed(1)}px). ` +
          `Difference of ${difference.toFixed(1)}px suggests triangle is using wrong line height.`,
      ).toBeLessThan(2);
    }).pipe(runtime.runPromise);
  });
});
