import "@/index.css";
import { Id } from "@/schema";
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

/**
 * Tests for document-order block selection navigation.
 *
 * Current behavior: ArrowUp/ArrowDown in block selection mode is confined to siblings.
 * New behavior: Navigation follows visual document order, crossing parent/child boundaries.
 *
 * Document order means:
 * - ArrowDown: if expanded and has children -> first child, else -> next in document order
 * - ArrowUp: previous in document order (prev sibling's deepest visible child, or parent)
 */
describe("Block selection document-order navigation - ArrowUp", () => {
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

  it("ArrowUp from first child selects parent", async () => {
    await Effect.gen(function* () {
      // Given: Parent with children A, B, C
      // Structure:
      //   Parent
      //     A  <- selected
      //     B
      //     C
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];

      // Add children to parent
      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "C",
      });

      const childABlockId = Id.makeBlockId(bufferId, childA);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on child A (first child)
      yield* When.USER_ENTERS_BLOCK_SELECTION(childABlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childA]);

      // When: ArrowUp pressed
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: Parent should be selected (document order goes to parent)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId], {
        anchor: parentNodeId,
        focus: parentNodeId,
      });
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp from block goes to prev sibling's deepest visible child", async () => {
    await Effect.gen(function* () {
      // Given: Structure
      //   A (expanded)
      //     A1
      //       A1a  <- deepest
      //   B  <- selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add nested children to A: A -> A1 -> A1a
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const nodeA1a = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Verify A and A1 are expanded (default state)
      yield* Then.BLOCK_IS_EXPANDED(Id.makeBlockId(bufferId, nodeA));
      yield* Then.BLOCK_IS_EXPANDED(Id.makeBlockId(bufferId, nodeA1));

      // Enter block selection mode on B
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockB);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeB]);

      // When: ArrowUp pressed
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: A1a (deepest last child of A) should be selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA1a], {
        anchor: nodeA1a,
        focus: nodeA1a,
      });
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp at first block at root scrolls to top and keeps selection", async () => {
    await Effect.gen(function* () {
      // Given: First block at buffer root is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstNodeId = childNodeIds[0];
      const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on first block
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstNodeId]);

      // When: ArrowUp pressed
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: Selection should stay on first block
      // (scroll-to-top behavior is tested separately, here we verify selection persists)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstNodeId], {
        anchor: firstNodeId,
        focus: firstNodeId,
      });
    }).pipe(runtime.runPromise);
  });
});

describe("Block selection document-order navigation - ArrowDown", () => {
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

  it("ArrowDown from expanded parent selects first child", async () => {
    await Effect.gen(function* () {
      // Given: Expanded parent with children
      // Structure:
      //   Parent <- selected, expanded
      //     A
      //     B
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const parentNodeId = childNodeIds[0];
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add children to parent
      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // When: ArrowDown pressed
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: First child (A) should be selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childA], {
        anchor: childA,
        focus: childA,
      });
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown from collapsed parent skips children", async () => {
    await Effect.gen(function* () {
      // Given: Collapsed parent with children, and a next sibling
      // Structure:
      //   Parent <- selected, collapsed
      //     A (hidden)
      //     B (hidden)
      //   NextSibling
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }, { text: "NextSibling" }],
      );

      const [parentNodeId, nextSiblingId] = childNodeIds;
      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      // Add children to parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse the parent
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(parentBlockId);

      // Enter block selection mode on parent
      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

      // When: ArrowDown pressed
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: NextSibling should be selected (not the hidden children)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nextSiblingId], {
        anchor: nextSiblingId,
        focus: nextSiblingId,
      });
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown from last child goes to parent's next sibling", async () => {
    await Effect.gen(function* () {
      // Given: Structure
      //   A
      //     A1
      //     A2  <- selected (last child)
      //   B     <- should be selected after ArrowDown
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;

      // Add children to A
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const nodeA2 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A2",
      });

      const blockA2 = Id.makeBlockId(bufferId, nodeA2);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on A2 (last child of A)
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA2);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA2]);

      // When: ArrowDown pressed
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: B (parent's next sibling) should be selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeB], {
        anchor: nodeB,
        focus: nodeB,
      });
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown at last block at root keeps selection", async () => {
    await Effect.gen(function* () {
      // Given: Last block at buffer root is selected
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Last block" }],
      );

      const lastNodeId = childNodeIds[1];
      const lastBlockId = Id.makeBlockId(bufferId, lastNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on last block
      yield* When.USER_ENTERS_BLOCK_SELECTION(lastBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [lastNodeId]);

      // When: ArrowDown pressed
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Selection should stay on last block (nowhere to go)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [lastNodeId], {
        anchor: lastNodeId,
        focus: lastNodeId,
      });
    }).pipe(runtime.runPromise);
  });
});

describe("Block selection document-order navigation - Edge cases", () => {
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

  it("ArrowUp respects collapsed state - stops at collapsed sibling", async () => {
    await Effect.gen(function* () {
      // Given: Structure
      //   A (collapsed)
      //     A1 (hidden)
      //   B  <- selected
      // ArrowUp should go to A (not A1, because A is collapsed)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockB = Id.makeBlockId(bufferId, nodeB);

      // Add child to A
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse A
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);
      yield* Then.BLOCK_IS_COLLAPSED(blockA);

      // Enter block selection mode on B
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockB);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeB]);

      // When: ArrowUp pressed
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: A should be selected (not A1, because A is collapsed)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA], {
        anchor: nodeA,
        focus: nodeA,
      });
    }).pipe(runtime.runPromise);
  });

  it("ArrowDown from deeply nested last child climbs up to find next", async () => {
    await Effect.gen(function* () {
      // Given: Structure
      //   A
      //     A1
      //       A1a  <- selected (deeply nested, last child at every level)
      //   B        <- should be selected after ArrowDown
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;

      // Create deep nesting: A -> A1 -> A1a
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const nodeA1a = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });

      const blockA1a = Id.makeBlockId(bufferId, nodeA1a);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on A1a (deeply nested)
      yield* When.USER_ENTERS_BLOCK_SELECTION(blockA1a);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeA1a]);

      // When: ArrowDown pressed
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: B should be selected (climbed up through A1 and A to find B)
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [nodeB], {
        anchor: nodeB,
        focus: nodeB,
      });
    }).pipe(runtime.runPromise);
  });
});
