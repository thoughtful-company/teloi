import "@/index.css";
import { NodeT } from "@/services/domain/Node";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "../bdd";

/**
 * Tests for NodeT.getAllDescendants helper.
 * This helper recursively collects all descendant node IDs in depth-first order.
 */
describe("NodeT.getAllDescendants", () => {
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

  it("returns empty array for node with no children", async () => {
    await Effect.gen(function* () {
      const { nodeId } = yield* Given.A_BUFFER_WITH_TEXT("Leaf node");

      const Node = yield* NodeT;
      const descendants = yield* Node.getAllDescendants(nodeId);

      expect(descendants).toEqual([]);
    }).pipe(runtime.runPromise);
  });

  it("returns direct children for single-level hierarchy", async () => {
    await Effect.gen(function* () {
      const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Parent",
        [{ text: "ChildA" }, { text: "ChildB" }, { text: "ChildC" }],
      );

      const [childA, childB, childC] = childNodeIds;

      const Node = yield* NodeT;
      const descendants = yield* Node.getAllDescendants(rootNodeId);

      // Should contain all direct children
      expect(descendants).toHaveLength(3);
      expect(descendants).toContain(childA);
      expect(descendants).toContain(childB);
      expect(descendants).toContain(childC);
    }).pipe(runtime.runPromise);
  });

  it("returns all descendants recursively in depth-first order", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A
      //       - A1
      //       - A2
      //     - B
      //       - B1
      const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "B" }],
      );

      const [nodeA, nodeB] = childNodeIds;

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

      // Add child to B
      const nodeB1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "B1",
      });

      const Node = yield* NodeT;
      const descendants = yield* Node.getAllDescendants(rootNodeId);

      // Should contain all 5 descendants: A, A1, A2, B, B1
      expect(descendants).toHaveLength(5);
      expect(descendants).toContain(nodeA);
      expect(descendants).toContain(nodeA1);
      expect(descendants).toContain(nodeA2);
      expect(descendants).toContain(nodeB);
      expect(descendants).toContain(nodeB1);

      // Depth-first order: A appears before A1/A2, B appears before B1
      const indexA = descendants.indexOf(nodeA);
      const indexA1 = descendants.indexOf(nodeA1);
      const indexA2 = descendants.indexOf(nodeA2);
      const indexB = descendants.indexOf(nodeB);
      const indexB1 = descendants.indexOf(nodeB1);

      // A should come before its children
      expect(indexA).toBeLessThan(indexA1);
      expect(indexA).toBeLessThan(indexA2);

      // B should come before its children
      expect(indexB).toBeLessThan(indexB1);

      // A's subtree should be complete before B starts
      // (depth-first pre-order: A, A1, A2, B, B1)
      expect(indexA1).toBeLessThan(indexB);
      expect(indexA2).toBeLessThan(indexB);
    }).pipe(runtime.runPromise);
  });

  it("handles deeply nested hierarchies", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - Level1
      //       - Level2
      //         - Level3
      //           - Level4
      const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Level1" }],
      );

      const [level1] = childNodeIds;

      const level2 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: level1,
        insert: "after",
        text: "Level2",
      });

      const level3 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: level2,
        insert: "after",
        text: "Level3",
      });

      const level4 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: level3,
        insert: "after",
        text: "Level4",
      });

      const Node = yield* NodeT;
      const descendants = yield* Node.getAllDescendants(rootNodeId);

      // Should contain all 4 levels
      expect(descendants).toHaveLength(4);
      expect(descendants).toEqual([level1, level2, level3, level4]);
    }).pipe(runtime.runPromise);
  });

  it("does not include the root node itself", async () => {
    await Effect.gen(function* () {
      const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Child" }],
      );

      const Node = yield* NodeT;
      const descendants = yield* Node.getAllDescendants(rootNodeId);

      // Should NOT contain the root node itself
      expect(descendants).not.toContain(rootNodeId);

      // Should contain only the child
      expect(descendants).toEqual([childNodeIds[0]]);
    }).pipe(runtime.runPromise);
  });
});
