import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import * as Given from "@/test-utils/bdd/given";
import { setupUnitTest, type UnitRuntime } from "@/test-utils/unit/setup";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Tests for ViewNavigationT page view navigation.
 *
 * These test the tree traversal logic directly via the service interface,
 * verifying that resolveBlockAbove/Below correctly navigate document order
 * while respecting expand/collapse state.
 */

// ================================ Internal ==================================

/** Write block expand state directly to StoreT (avoids pulling in BlockLive) */
const SET_BLOCK_COLLAPSED = (blockId: Id.Block) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.setDocument(
      "block",
      { isExpanded: false, activeViewId: null },
      blockId,
    );
  });

// ============================================================================

describe("ViewNavigation - page view", () => {
  let runtime: UnitRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  describe("Flat siblings", () => {
    it("resolveBlockBelow returns next sibling", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }, { text: "C" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockBelow(nodeA, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(nodeB);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockAbove returns previous sibling", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }, { text: "C" }],
        );
        const [_nodeA, nodeB, nodeC] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockAbove(nodeC, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(nodeB);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Parent-child navigation", () => {
    it("resolveBlockBelow descends into first child of expanded block", async () => {
      await Effect.gen(function* () {
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

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockBelow(parentNodeId, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(childNodeId);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockAbove from first child goes to parent", async () => {
      await Effect.gen(function* () {
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

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockAbove(childNodeId, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(parentNodeId);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Deepest last child", () => {
    it("resolveBlockAbove from sibling goes to deepest last child of previous sibling", async () => {
      await Effect.gen(function* () {
        // Structure: Root -> [A, B]
        //            A -> [A1]
        //            A1 -> [A1a]
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

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

        const Nav = yield* ViewNavigationT;
        // B's previous sibling is A, but A is expanded with children
        // so we should get A1a (deepest last child of A)
        const result = yield* Nav.resolveBlockAbove(nodeB, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(nodeA1a);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockAbove respects expand state when finding deepest last child", async () => {
      await Effect.gen(function* () {
        // Structure: Root -> [A, B]
        //            A -> [A1]
        //            A1 -> [A1a]
        // A1 is collapsed, so deepest last child of A is A1 (not A1a)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "A1",
        });

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA1,
          insert: "after",
          text: "A1a",
        });

        // Collapse A1
        const blockA1 = Id.makeBufferBlockId(bufferId, nodeA1);
        yield* SET_BLOCK_COLLAPSED(blockA1);

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockAbove(nodeB, bufferId);

        expect(Option.isSome(result)).toBe(true);
        // A1 is collapsed, so we stop there instead of descending to A1a
        expect(Option.getOrThrow(result)).toBe(nodeA1);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Collapsed blocks", () => {
    it("resolveBlockBelow skips children of collapsed block", async () => {
      await Effect.gen(function* () {
        // Structure: Root -> [A, B]
        //            A -> [A1]
        // A is collapsed, so resolveBlockBelow(A) should go to B, not A1
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "A1",
        });

        // Collapse A
        const blockA = Id.makeBufferBlockId(bufferId, nodeA);
        yield* SET_BLOCK_COLLAPSED(blockA);

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockBelow(nodeA, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(nodeB);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockAbove skips into collapsed subtrees", async () => {
      await Effect.gen(function* () {
        // Structure: Root -> [A, B]
        //            A -> [A1, A2]
        // A is collapsed, so resolveBlockAbove(B) should go to A, not A2
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "A1",
        });

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "A2",
        });

        // Collapse A
        const blockA = Id.makeBufferBlockId(bufferId, nodeA);
        yield* SET_BLOCK_COLLAPSED(blockA);

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockAbove(nodeB, bufferId);

        expect(Option.isSome(result)).toBe(true);
        // A is collapsed, so findDeepestLastChild returns A itself
        expect(Option.getOrThrow(result)).toBe(nodeA);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Edge cases", () => {
    it("resolveBlockAbove at first root child returns buffer root (parent)", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds, rootNodeId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "First" }]);
        const firstNodeId = childNodeIds[0];

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockAbove(firstNodeId, bufferId);

        // The first child's parent is the root node, so resolveBlockAbove returns rootNodeId
        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(rootNodeId);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockAbove at buffer root returns None", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }],
        );

        const Nav = yield* ViewNavigationT;
        // The rootNodeId has no parent in the test setup, so this should be None
        const result = yield* Nav.resolveBlockAbove(rootNodeId, bufferId);

        expect(Option.isNone(result)).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockBelow at last node in tree returns None", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Only" }],
        );
        const onlyNodeId = childNodeIds[0];

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockBelow(onlyNodeId, bufferId);

        expect(Option.isNone(result)).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockBelow at deeply nested last node returns None", async () => {
      await Effect.gen(function* () {
        // Structure: Root -> [A]
        //            A -> [A1]
        //            A1 -> [A1a]
        // A1a is the last node in document order
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }],
        );
        const nodeA = childNodeIds[0];

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

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockBelow(nodeA1a, bufferId);

        expect(Option.isNone(result)).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockBelow walks up to find next uncle when at last child", async () => {
      await Effect.gen(function* () {
        // Structure: Root -> [A, B]
        //            A -> [A1]
        // resolveBlockBelow(A1) should find B (next sibling of A)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "A1",
        });

        const Nav = yield* ViewNavigationT;
        const result = yield* Nav.resolveBlockBelow(nodeA1, bufferId);

        expect(Option.isSome(result)).toBe(true);
        expect(Option.getOrThrow(result)).toBe(nodeB);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Left/Right aliases", () => {
    it("resolveBlockLeft behaves the same as resolveBlockAbove", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const above = yield* Nav.resolveBlockAbove(nodeB, bufferId);
        const left = yield* Nav.resolveBlockLeft(nodeB, bufferId);

        expect(Option.getOrThrow(above)).toBe(nodeA);
        expect(Option.getOrThrow(left)).toBe(nodeA);
      }).pipe(runtime.runPromise);
    });

    it("resolveBlockRight behaves the same as resolveBlockBelow", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "A" }, { text: "B" }],
        );
        const [nodeA, nodeB] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const below = yield* Nav.resolveBlockBelow(nodeA, bufferId);
        const right = yield* Nav.resolveBlockRight(nodeA, bufferId);

        expect(Option.getOrThrow(below)).toBe(nodeB);
        expect(Option.getOrThrow(right)).toBe(nodeB);
      }).pipe(runtime.runPromise);
    });
  });

  describe("createBlock", () => {
    it("creates a sibling after the given node", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds, rootNodeId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "A" },
            { text: "B" },
            { text: "C" },
          ]);
        const [_nodeA, nodeB, nodeC] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const newNodeId = yield* Nav.createBlock(nodeB, bufferId, "after");

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);

        // New node should be between B and C
        expect(children).toHaveLength(4);
        expect(children[2]).toBe(newNodeId);
        expect(children[3]).toBe(nodeC);
      }).pipe(runtime.runPromise);
    });

    it("creates a sibling before the given node", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds, rootNodeId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "A" },
            { text: "B" },
            { text: "C" },
          ]);
        const [nodeA, nodeB] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const newNodeId = yield* Nav.createBlock(nodeB, bufferId, "before");

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);

        // New node should be between A and B
        expect(children).toHaveLength(4);
        expect(children[0]).toBe(nodeA);
        expect(children[1]).toBe(newNodeId);
        expect(children[2]).toBe(nodeB);
      }).pipe(runtime.runPromise);
    });

    it("creates first child when nodeId is the buffer root (title context)", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds, rootNodeId } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "A" },
            { text: "B" },
          ]);
        const [nodeA] = childNodeIds;

        const Nav = yield* ViewNavigationT;
        const newNodeId = yield* Nav.createBlock(rootNodeId, bufferId, "after");

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);

        // New node should be the first child, before A
        expect(children).toHaveLength(3);
        expect(children[0]).toBe(newNodeId);
        expect(children[1]).toBe(nodeA);
      }).pipe(runtime.runPromise);
    });
  });
});
