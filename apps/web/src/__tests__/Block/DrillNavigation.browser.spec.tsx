import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Drill navigation - Text editing mode", () => {
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

  it("Cmd+Shift+Down navigates to first child", async () => {
    await Effect.gen(function* () {
      // Given: A parent block with existing children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add children to the parent
      const firstChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "First child",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Second child",
      });
      const firstChildBlockId = Id.makeBlockId(bufferId, firstChildId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the parent block
      yield* When.USER_CLICKS_BLOCK(parentBlockId);

      // When: Cmd+Shift+Down pressed
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowDown}{/Meta}{/Shift}");

      // Then: Focus moves to first child
      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Down creates child if childless and focuses it", async () => {
    await Effect.gen(function* () {
      // Given: A block with no children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Leaf block" }],
      );

      const leafNodeId = childNodeIds[0];
      const leafBlockId = Id.makeBlockId(bufferId, leafNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify no children initially
      const Node = yield* NodeT;
      const childrenBefore = yield* Node.getNodeChildren(leafNodeId);
      expect(childrenBefore.length).toBe(0);

      // Focus on the leaf block
      yield* When.USER_CLICKS_BLOCK(leafBlockId);

      // When: Cmd+Shift+Down pressed
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowDown}{/Meta}{/Shift}");

      // Then: A new child block is created
      const childrenAfter = yield* Node.getNodeChildren(leafNodeId);
      expect(childrenAfter.length).toBe(1);

      // And: The new child block is focused
      const newChildBlockId = Id.makeBlockId(bufferId, childrenAfter[0]!);
      yield* Then.SELECTION_IS_ON_BLOCK(newChildBlockId);

      // And: The new child starts with empty text
      yield* Then.NODE_HAS_TEXT(childrenAfter[0]!, "");
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Down preserves goalX", async () => {
    await Effect.gen(function* () {
      // Given: A parent block with a child
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

  it("Cmd+Shift+Up collapses and navigates to parent", async () => {
    await Effect.gen(function* () {
      // Given: Parent -> Child hierarchy (child has no children, collapsing just sets state)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent block" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add child (leaf node)
      const childId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block",
      });
      const childBlockId = Id.makeBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Then.TEXT_IS_VISIBLE("Child block");

      // Focus on child block
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      // When: Cmd+Shift+Up pressed
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: Focus moves to parent
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Up preserves goalX", async () => {
    await Effect.gen(function* () {
      // Given: Parent -> Child hierarchy
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent text here" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add child with longer text
      const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child block with some text",
      });
      const childBlockId = Id.makeBlockId(bufferId, childNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus child and position cursor
      yield* When.USER_CLICKS_BLOCK(childBlockId);

      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // Move cursor to position 6 ("Child |block...")
      yield* When.USER_PRESSES("{Home}");
      for (let i = 0; i < 6; i++) {
        yield* When.USER_PRESSES("{ArrowRight}");
      }

      // Record X position in child
      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });

      // When: Cmd+Shift+Up to drill out to parent
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: Focus is on parent block
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);

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

  it("Cmd+Shift+Up on root block navigates to title", async () => {
    await Effect.gen(function* () {
      // Given: A first-level block (root's direct child)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First level block" }],
      );

      const firstLevelNodeId = childNodeIds[0];
      const firstLevelBlockId = Id.makeBlockId(bufferId, firstLevelNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus on the first-level block
      yield* When.USER_CLICKS_BLOCK(firstLevelBlockId);

      // Wait for CodeMirror to be focused
      yield* Effect.promise(() =>
        waitFor(() => {
          const cmEditor = document.querySelector(".cm-editor.cm-focused");
          if (!cmEditor) throw new Error("CodeMirror not focused");
        }),
      );

      // When: Cmd+Shift+Up pressed
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: Focus moves to Title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });
});

describe("Drill navigation - Block selection mode", () => {
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

  it("Cmd+Shift+Down in selection mode navigates to first child", async () => {
    await Effect.gen(function* () {
      // Given: A block with children is selected in block selection mode
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add children to the parent
      const firstChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "First child",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Second child",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // When: Cmd+Shift+Down pressed
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowDown}{/Meta}{/Shift}");

      // Then: Selection moves to first child (stays in block selection mode)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstChildId]);
    }).pipe(runtime.runPromise);
  });

  it("Cmd+Shift+Up in selection mode collapses and navigates to parent", async () => {
    await Effect.gen(function* () {
      // Given: Parent block with children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add children to Parent
      const firstChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "First child",
      });
      const firstChildBlockId = Id.makeBlockId(bufferId, firstChildId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify children are visible (Parent is expanded)
      yield* Then.TEXT_IS_VISIBLE("First child");
      yield* Then.BLOCK_IS_EXPANDED(parentBlockId);

      // Enter block selection mode on first child
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstChildBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstChildId]);

      // When: Cmd+Shift+Up pressed
      yield* When.USER_PRESSES("{Shift>}{Meta>}{ArrowUp}{/Meta}{/Shift}");

      // Then: Selection moves to parent (stays in block selection mode)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);
    }).pipe(runtime.runPromise);
  });
});
