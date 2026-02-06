import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Block Cmd+Shift+Backspace (Force Delete)", () => {
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

  describe("in text editing mode", () => {
    it("deletes current block and all its children", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root (frame)
        //     - Parent (will be focused)
        //       - ChildA
        //       - ChildB
        //     - Sibling
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root", [
            { text: "Parent" },
            { text: "Sibling" },
          ]);

        const [parentNodeId, siblingNodeId] = childNodeIds;

        // Add children to Parent
        const childA = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "ChildA",
        });
        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          siblingId: childA,
          text: "ChildB",
        });

        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        // Focus the parent block (text editing mode)
        yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);

        // Press Cmd+Shift+Backspace to force-delete
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Parent and its children should be deleted
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        // Only Sibling should remain
        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        expect(children).toEqual([siblingNodeId]);
      }).pipe(runtime.runPromise);
    });

    it("moves focus to previous sibling after deletion", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - First
        //     - Second (will be deleted)
        //     - Third
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [firstNodeId, secondNodeId] = childNodeIds;
        const secondBlockId = Id.makeFrameBlockId(frameId, secondNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Second should be deleted
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

        // Focus should be on First (previous sibling)
        yield* Then.SELECTION_IS_ON_BLOCK(
          Id.makeFrameBlockId(frameId, firstNodeId),
        );
      }).pipe(runtime.runPromise);
    });

    it("moves focus to parent if no previous sibling", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent
        //       - OnlyChild (will be deleted)
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }],
        );

        const [parentNodeId] = childNodeIds;

        const onlyChild = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "OnlyChild",
        });

        const onlyChildBlockId = Id.makeFrameBlockId(frameId, onlyChild);
        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(onlyChildBlockId, 0);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // OnlyChild should be deleted, Parent should have no children
        yield* Then.NODE_HAS_CHILDREN(parentNodeId, 0);

        // Focus should move to Parent
        yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      }).pipe(runtime.runPromise);
    });

    it("cleans up Automerge text content for deleted nodes", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent (will be deleted)
        //       - Child
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "Parent text" }],
        );

        const [parentNodeId] = childNodeIds;

        const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child text",
        });

        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Verify Automerge text is cleaned up for both parent and child
        const Automerge = yield* AutomergeT;
        const parentText = yield* Automerge.getText(parentNodeId);
        const childText = yield* Automerge.getText(childNodeId);

        expect(parentText).toBe("");
        expect(childText).toBe("");
      }).pipe(runtime.runPromise);
    });
  });

  describe("in block selection mode", () => {
    it("deletes selected block and all its children", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent (will be selected and deleted)
        //       - ChildA
        //       - ChildB
        //     - Sibling
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root", [
            { text: "Parent" },
            { text: "Sibling" },
          ]);

        const [parentNodeId, siblingNodeId] = childNodeIds;

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "ChildA",
        });
        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "ChildB",
        });

        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        // Enter block selection mode on Parent
        yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
        yield* Then.BLOCKS_ARE_SELECTED(frameId, [parentNodeId]);

        // Press Cmd+Shift+Backspace to force-delete
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Only Sibling should remain
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        expect(children).toEqual([siblingNodeId]);
      }).pipe(runtime.runPromise);
    });

    it("deletes multiple selected blocks and all their children", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - First (will be selected)
        //       - FirstChild
        //     - Second (will be selected)
        //       - SecondChild
        //     - Third
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [firstNodeId, secondNodeId, thirdNodeId] = childNodeIds;

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: firstNodeId,
          insert: "after",
          text: "FirstChild",
        });
        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: secondNodeId,
          insert: "after",
          text: "SecondChild",
        });

        const firstBlockId = Id.makeFrameBlockId(frameId, firstNodeId);

        render(() => <FrameView frameId={frameId} />);

        // Select First, extend selection to include Second
        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
        yield* Then.BLOCKS_ARE_SELECTED(frameId, [firstNodeId, secondNodeId]);

        // Press Cmd+Shift+Backspace to force-delete both
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Only Third should remain
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        expect(children).toEqual([thirdNodeId]);
      }).pipe(runtime.runPromise);
    });

    it("moves focus appropriately after deletion", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - First
        //     - Second (will be deleted)
        //     - Third
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }, { text: "Third" }],
        );

        const [firstNodeId, secondNodeId] = childNodeIds;
        const secondBlockId = Id.makeFrameBlockId(frameId, secondNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Focus should move to First (previous sibling)
        yield* Then.BLOCKS_ARE_SELECTED(frameId, [firstNodeId]);
      }).pipe(runtime.runPromise);
    });

    it("cleans up Automerge text content for all deleted nodes", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent (will be selected and deleted)
        //       - Child
        //     - Sibling
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }, { text: "Sibling" }],
        );

        const [parentNodeId] = childNodeIds;

        const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child text",
        });

        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Verify Automerge text is cleaned up for both parent and child
        const Automerge = yield* AutomergeT;
        const parentText = yield* Automerge.getText(parentNodeId);
        const childText = yield* Automerge.getText(childNodeId);

        expect(parentText).toBe("");
        expect(childText).toBe("");
      }).pipe(runtime.runPromise);
    });
  });
});

describe("Regular Delete Automerge cleanup (Bug fix)", () => {
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

  it("Delete in block selection mode cleans up Automerge text", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "First block text" }, { text: "Second" }],
      );

      const [firstNodeId] = childNodeIds;
      const firstBlockId = Id.makeFrameBlockId(frameId, firstNodeId);

      render(() => <FrameView frameId={frameId} />);

      // Enter block selection mode on First
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [firstNodeId]);

      // Press Delete to delete the block
      yield* When.USER_PRESSES("{Delete}");

      // Verify Automerge text is cleaned up for the deleted node
      const Automerge = yield* AutomergeT;
      const firstText = yield* Automerge.getText(firstNodeId);
      expect(firstText).toBe("");
    }).pipe(runtime.runPromise);
  });

  it("Backspace in block selection mode cleans up Automerge text", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "First" }, { text: "Block to delete" }],
      );

      const [, secondNodeId] = childNodeIds;
      const secondBlockId = Id.makeFrameBlockId(frameId, secondNodeId);

      render(() => <FrameView frameId={frameId} />);

      // Enter block selection mode on Second
      yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [secondNodeId]);

      // Press Backspace to delete the block
      yield* When.USER_PRESSES("{Backspace}");

      // Verify Automerge text is cleaned up for the deleted node
      const Automerge = yield* AutomergeT;
      const secondText = yield* Automerge.getText(secondNodeId);
      expect(secondText).toBe("");
    }).pipe(runtime.runPromise);
  });

  it("deleting multiple blocks cleans up Automerge text for all", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [
          { text: "First to delete" },
          { text: "Second to delete" },
          { text: "Third remains" },
        ],
      );

      const [firstNodeId, secondNodeId, thirdNodeId] = childNodeIds;
      const firstBlockId = Id.makeFrameBlockId(frameId, firstNodeId);

      render(() => <FrameView frameId={frameId} />);

      // Select first two blocks
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [firstNodeId, secondNodeId]);

      // Press Delete to delete both blocks
      yield* When.USER_PRESSES("{Delete}");

      // Verify Automerge text is cleaned up for both deleted nodes
      const Automerge = yield* AutomergeT;
      const firstText = yield* Automerge.getText(firstNodeId);
      const secondText = yield* Automerge.getText(secondNodeId);
      expect(firstText).toBe("");
      expect(secondText).toBe("");

      // Third block's text should still be there
      const thirdText = yield* Automerge.getText(thirdNodeId);
      expect(thirdText).toBe("Third remains");
    }).pipe(runtime.runPromise);
  });
});
