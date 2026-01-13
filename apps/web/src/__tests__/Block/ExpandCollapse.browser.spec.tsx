import "@/index.css";
import { Id } from "@/schema";
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

  // TODO: This test is flaky - the child block ID doesn't match expected.
  // The behavior is tested in ExpandChildless.browser.spec.tsx.
  it.skip("Cmd+Down on expanded block focuses first child", async () => {
    await Effect.gen(function* () {
      // Given: An expanded block with children
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

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

      // Verify initially expanded
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Cmd+Down pressed
      yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

      // Then: Focus moves to first child
      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Up on first-level block drills out to title", async () => {
    await Effect.gen(function* () {
      // Given: A first-level block
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

      // When: Cmd+Shift+Up pressed (drill out)
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: Focus moves to Title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Up collapses PARENT and drills out to parent", async () => {
    await Effect.gen(function* () {
      // Given: Parent has child "A"
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add Child A to Parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child A",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Wait for hierarchy to render
      yield* Then.TEXT_IS_VISIBLE("Child A");

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

      // When: Cmd+Shift+Up pressed (drill out)
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: PARENT is collapsed (we drilled out of that level)
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Then: Focus moves to Parent (cursor is in Parent's text editor)
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Down preserves goalX when drilling into first child", async () => {
    await Effect.gen(function* () {
      // Given: A parent block with a child that has longer text
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent text here" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add child with text
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block with some text",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus parent and position cursor in the middle
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // Wait for CodeMirror
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Move cursor to position 8 ("Parent t|ext here")
      yield* When.USER_PRESSES("{Home}");
      for (let i = 0; i < 8; i++) {
        yield* When.USER_PRESSES("{ArrowRight}");
      }

      // Record X position in parent
      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });

      // When: Cmd+Shift+Down to drill into child
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowDown}{/Meta}{/Shift}");

      // Then: Focus is on child block
      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);

      // And: X position is preserved (within 10px tolerance)
      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          return sel.getRangeAt(0).getBoundingClientRect().left;
        }),
      );

      const delta = Math.abs(xAfter - xBefore);
      expect(delta).toBeLessThan(10);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Up then Cmd+Shift+Down round-trip preserves cursor position", async () => {
    await Effect.gen(function* () {
      const { BufferT } = yield* Effect.promise(() =>
        import("@/services/ui/Buffer"),
      );
      const Buffer = yield* BufferT;

      // Given: Parent "Serial Lain Experiments" with child "ss"
      // User bug: cursor at "ss|" → Cmd+Shift+Up → Cmd+Shift+Down → cursor lands at "s|s"
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Serial Lain Experiments" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add child "ss"
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "ss",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus child and position cursor at end: "ss|"
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Move to end of "ss" (offset 2)
      yield* When.USER_PRESSES("{End}");

      // Verify we're at offset 2
      const selBefore = yield* Buffer.getSelection(bufferId);
      const offsetBefore = Option.map(selBefore, (s) => s.focusOffset).pipe(
        Option.getOrElse(() => -1),
      );

      // When: Cmd+Shift+Up then Cmd+Shift+Down (drill round-trip)
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowDown}{/Meta}{/Shift}");
      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);

      // Get actual DOM cursor offset after round-trip
      const domOffset = yield* Effect.promise(() =>
        waitFor(() => {
          const cmContent = document.querySelector(".cm-content");
          const sel = window.getSelection();
          if (!sel || !cmContent) throw new Error("No selection");
          return sel.focusOffset;
        }),
      );

      // The offset should be preserved (2 → 2, not 2 → 0 or 2 → 1)
      expect(offsetBefore).toBe(2);
      expect(domOffset).toBe(2);
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

  it("Cmd+Down expands only the selected block on first press", async () => {
    await Effect.gen(function* () {
      // Given: A -> B (collapsed), B -> C (collapsed)
      // A is selected in block selection mode, both A and B are collapsed
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "A" }]);

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
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "A" }]);

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

  it("Cmd+Up collapses deepest expanded descendants first", async () => {
    await Effect.gen(function* () {
      // Given: A -> B -> C, all expanded
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "A" }]);

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

      // Wait for hierarchy to render (all blocks expanded by default)
      yield* Then.TEXT_IS_VISIBLE("B");
      yield* Then.TEXT_IS_VISIBLE("C");

      // Verify both A and B are expanded (default state)
      yield* Then.BLOCK_IS_EXPANDED(blockA);
      yield* Then.BLOCK_IS_EXPANDED(blockB);

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

      // Then: B collapsed (deepest with children), A still expanded
      yield* Then.BLOCK_IS_COLLAPSED(blockB);
      yield* Then.BLOCK_IS_EXPANDED(blockA);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Up collapses the block itself when no expanded descendants", async () => {
    await Effect.gen(function* () {
      // Given: A -> B -> C, where B is collapsed (no expanded descendants under A)
      const { bufferId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "A" }]);

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

  it("Cmd+Shift+Up (DrillOut) collapses PARENT when on child", async () => {
    await Effect.gen(function* () {
      // Given: Root > Parent > Child
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add Child to Parent
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify initial state: Parent expanded, Child visible
      yield* Then.TEXT_IS_VISIBLE("Parent");
      yield* Then.TEXT_IS_VISIBLE("Child");
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Enter block selection mode on Child
      yield* When.USER_ENTERS_BLOCK_SELECTION(
        Id.makeBlockId(bufferId, childNodeId),
      );
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeId]);

      // When: Cmd+Shift+Up (DrillOut)
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: PARENT should be collapsed (we drilled out of it)
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // And: Selection moved to Parent
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
