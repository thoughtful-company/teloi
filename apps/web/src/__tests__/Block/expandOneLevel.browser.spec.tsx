import "@/index.css";
import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

/**
 * Tests for BlockT.expandOneLevel function.
 *
 * This function progressively expands a tree level-by-level using DFS order:
 * 1. If the given node's block is collapsed, expand it and return true
 * 2. If expanded, check children (in order) for the first collapsed node
 * 3. When a collapsed node is found, expand it and return true
 * 4. If everything is already expanded, return false
 */
describe("BlockT.expandOneLevel", () => {
  let runtime: BrowserRuntime;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("expands self when collapsed", async () => {
    await Effect.gen(function* () {
      // Given: A collapsed node with children
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      // Add child to make A expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      // Collapse the node
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);

      // Verify collapsed
      const isExpandedBefore = yield* Block.isExpanded(blockA);
      expect(isExpandedBefore).toBe(false);

      // When: expandOneLevel is called
      const result = yield* Block.expandOneLevel(frameId, nodeA);

      // Then: Node is expanded and returns true
      expect(result).toBe(true);
      const isExpandedAfter = yield* Block.isExpanded(blockA);
      expect(isExpandedAfter).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("expands first collapsed child when self is expanded", async () => {
    await Effect.gen(function* () {
      // Given: A -> A1 (collapsed), A -> A2 (expanded)
      // A is expanded, A1 is collapsed
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      // Add children to A
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const blockA1 = Id.makeFrameBlockId(frameId, nodeA1);

      // Add child to A1 to make it expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });

      // A is expanded by default, collapse A1
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA1, false);

      // Verify initial state
      expect(yield* Block.isExpanded(blockA)).toBe(true);
      expect(yield* Block.isExpanded(blockA1)).toBe(false);

      // When: expandOneLevel is called on A
      const result = yield* Block.expandOneLevel(frameId, nodeA);

      // Then: A1 is expanded (first collapsed child)
      expect(result).toBe(true);
      expect(yield* Block.isExpanded(blockA1)).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("expands second collapsed child when first is already expanded", async () => {
    await Effect.gen(function* () {
      // Given: A -> A1 (expanded), A -> A2 (collapsed)
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];

      // Add children to A
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      const nodeA2 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        siblingId: nodeA1,
        text: "A2",
      });
      const blockA2 = Id.makeFrameBlockId(frameId, nodeA2);

      // Add children to A1 and A2 to make them expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA2,
        insert: "after",
        text: "A2a",
      });

      // Collapse only A2 (A and A1 remain expanded)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA2, false);

      // Verify initial state
      expect(yield* Block.isExpanded(blockA2)).toBe(false);

      // When: expandOneLevel is called on A
      const result = yield* Block.expandOneLevel(frameId, nodeA);

      // Then: A2 is expanded (second child, since A1 was already expanded)
      expect(result).toBe(true);
      expect(yield* Block.isExpanded(blockA2)).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("goes to grandchildren when all immediate children are expanded", async () => {
    await Effect.gen(function* () {
      // Given: A (expanded) -> A1 (expanded) -> A1a (collapsed)
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];

      // Add child A1
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      // Add grandchild A1a
      const nodeA1a = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });
      const blockA1a = Id.makeFrameBlockId(frameId, nodeA1a);

      // Add child to A1a to make it expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1a,
        insert: "after",
        text: "A1a1",
      });

      // Collapse only A1a (A and A1 remain expanded)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA1a, false);

      // Verify initial state
      expect(yield* Block.isExpanded(blockA1a)).toBe(false);

      // When: expandOneLevel is called on A
      const result = yield* Block.expandOneLevel(frameId, nodeA);

      // Then: A1a is expanded (grandchild level)
      expect(result).toBe(true);
      expect(yield* Block.isExpanded(blockA1a)).toBe(true);
    }).pipe(runtime.runPromise);
  });

  it("returns false when everything is already expanded", async () => {
    await Effect.gen(function* () {
      // Given: A (expanded) -> A1 (expanded) -> A1a (leaf, no children)
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      // Add child A1
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const blockA1 = Id.makeFrameBlockId(frameId, nodeA1);

      // Add grandchild A1a (leaf - no children)
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });

      // All nodes are expanded by default
      const Block = yield* BlockT;
      expect(yield* Block.isExpanded(blockA)).toBe(true);
      expect(yield* Block.isExpanded(blockA1)).toBe(true);

      // When: expandOneLevel is called
      const result = yield* Block.expandOneLevel(frameId, nodeA);

      // Then: Returns false (nothing to expand)
      expect(result).toBe(false);
    }).pipe(runtime.runPromise);
  });

  it("returns false when node has no children and is already expanded", async () => {
    await Effect.gen(function* () {
      // Given: A leaf node (no children)
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "Leaf" }],
      );

      const nodeLeaf = childNodeIds[0];
      const blockLeaf = Id.makeFrameBlockId(frameId, nodeLeaf);

      // Node is expanded by default (though it has no children)
      const Block = yield* BlockT;
      expect(yield* Block.isExpanded(blockLeaf)).toBe(true);

      // When: expandOneLevel is called
      const result = yield* Block.expandOneLevel(frameId, nodeLeaf);

      // Then: Returns false (no children to expand)
      expect(result).toBe(false);
    }).pipe(runtime.runPromise);
  });

  it("works with deeply nested hierarchies (3+ levels)", async () => {
    await Effect.gen(function* () {
      // Given: A -> A1 -> A1a -> A1a1 (all collapsed except A)
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];

      // Build deep hierarchy
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });
      const blockA1 = Id.makeFrameBlockId(frameId, nodeA1);

      const nodeA1a = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });
      const blockA1a = Id.makeFrameBlockId(frameId, nodeA1a);

      const nodeA1a1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1a,
        insert: "after",
        text: "A1a1",
      });
      const blockA1a1 = Id.makeFrameBlockId(frameId, nodeA1a1);

      // Add child to A1a1 to make it expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1a1,
        insert: "after",
        text: "A1a1x",
      });

      // Collapse A1, A1a, A1a1
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA1, false);
      yield* Block.setExpanded(blockA1a, false);
      yield* Block.setExpanded(blockA1a1, false);

      // First call: expands A1
      const result1 = yield* Block.expandOneLevel(frameId, nodeA);
      expect(result1).toBe(true);
      expect(yield* Block.isExpanded(blockA1)).toBe(true);
      expect(yield* Block.isExpanded(blockA1a)).toBe(false);
      expect(yield* Block.isExpanded(blockA1a1)).toBe(false);

      // Second call: expands A1a
      const result2 = yield* Block.expandOneLevel(frameId, nodeA);
      expect(result2).toBe(true);
      expect(yield* Block.isExpanded(blockA1a)).toBe(true);
      expect(yield* Block.isExpanded(blockA1a1)).toBe(false);

      // Third call: expands A1a1
      const result3 = yield* Block.expandOneLevel(frameId, nodeA);
      expect(result3).toBe(true);
      expect(yield* Block.isExpanded(blockA1a1)).toBe(true);

      // Fourth call: nothing left to expand
      const result4 = yield* Block.expandOneLevel(frameId, nodeA);
      expect(result4).toBe(false);
    }).pipe(runtime.runPromise);
  });

  it("follows DFS order: explores first child's subtree before second child", async () => {
    await Effect.gen(function* () {
      // Given: A -> A1 (expanded) -> A1a (collapsed)
      //           -> A2 (collapsed)
      // DFS should expand A1a before A2
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }],
      );

      const nodeA = childNodeIds[0];

      // Add two children to A
      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "A1",
      });

      const nodeA2 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        siblingId: nodeA1,
        text: "A2",
      });
      const blockA2 = Id.makeFrameBlockId(frameId, nodeA2);

      // Add A1a under A1
      const nodeA1a = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1,
        insert: "after",
        text: "A1a",
      });
      const blockA1a = Id.makeFrameBlockId(frameId, nodeA1a);

      // Add children to make A1a and A2 expandable
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA1a,
        insert: "after",
        text: "A1a1",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA2,
        insert: "after",
        text: "A2a",
      });

      // Collapse A1a and A2 (A1 stays expanded)
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA1a, false);
      yield* Block.setExpanded(blockA2, false);

      // First expandOneLevel should expand A1a (DFS: first child's subtree first)
      const result1 = yield* Block.expandOneLevel(frameId, nodeA);
      expect(result1).toBe(true);
      expect(yield* Block.isExpanded(blockA1a)).toBe(true);
      expect(yield* Block.isExpanded(blockA2)).toBe(false);

      // Second expandOneLevel should expand A2
      const result2 = yield* Block.expandOneLevel(frameId, nodeA);
      expect(result2).toBe(true);
      expect(yield* Block.isExpanded(blockA2)).toBe(true);
    }).pipe(runtime.runPromise);
  });
});
