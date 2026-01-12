import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

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
        //   Root (buffer)
        //     - Parent (will be focused)
        //       - ChildA
        //       - ChildB
        //     - Sibling
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
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

        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Focus the parent block (text editing mode)
        yield* When.USER_CLICKS_BLOCK(parentBlockId);

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
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [firstNodeId, secondNodeId] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, secondNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Second should be deleted
        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

        // Focus should be on First (previous sibling)
        yield* Then.SELECTION_IS_ON_BLOCK(Id.makeBlockId(bufferId, firstNodeId));
      }).pipe(runtime.runPromise);
    });

    it("moves focus to parent if no previous sibling", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent
        //       - OnlyChild (will be deleted)
        const { bufferId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [{ text: "Parent" }]);

        const [parentNodeId] = childNodeIds;

        const onlyChild = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "OnlyChild",
        });

        const onlyChildBlockId = Id.makeBlockId(bufferId, onlyChild);
        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(onlyChildBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // OnlyChild should be deleted, Parent should have no children
        yield* Then.NODE_HAS_CHILDREN(parentNodeId, 0);

        // Focus should move to Parent
        yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
      }).pipe(runtime.runPromise);
    });

    it("cleans up Yjs text content for deleted nodes", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent (will be deleted)
        //       - Child
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Parent text" }],
        );

        const [parentNodeId] = childNodeIds;

        const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child text",
        });

        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(parentBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Verify Yjs text is cleaned up for both parent and child
        const Yjs = yield* YjsT;
        const parentYtext = Yjs.getText(parentNodeId);
        const childYtext = Yjs.getText(childNodeId);

        expect(parentYtext.toString()).toBe("");
        expect(childYtext.toString()).toBe("");
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
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
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

        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Enter block selection mode on Parent
        yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [parentNodeId]);

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
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
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

        const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Select First, extend selection to include Second
        yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
        yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstNodeId, secondNodeId]);

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
        const { bufferId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [firstNodeId, secondNodeId] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, secondNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Focus should move to First (previous sibling)
        yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstNodeId]);
      }).pipe(runtime.runPromise);
    });

    it("cleans up Yjs text content for all deleted nodes", async () => {
      await Effect.gen(function* () {
        // Structure:
        //   Root
        //     - Parent (will be selected and deleted)
        //       - Child
        //     - Sibling
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }, { text: "Sibling" }],
        );

        const [parentNodeId] = childNodeIds;

        const childNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child text",
        });

        const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);
        yield* When.USER_PRESSES("{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}");

        // Verify Yjs text is cleaned up for both parent and child
        const Yjs = yield* YjsT;
        const parentYtext = Yjs.getText(parentNodeId);
        const childYtext = Yjs.getText(childNodeId);

        expect(parentYtext.toString()).toBe("");
        expect(childYtext.toString()).toBe("");
      }).pipe(runtime.runPromise);
    });
  });
});

describe("Regular Delete Yjs cleanup (Bug fix)", () => {
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

  it("Delete in block selection mode cleans up Yjs text", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block text" }, { text: "Second" }],
      );

      const [firstNodeId] = childNodeIds;
      const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on First
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstNodeId]);

      // Press Delete to delete the block
      yield* When.USER_PRESSES("{Delete}");

      // Verify Yjs text is cleaned up for the deleted node
      const Yjs = yield* YjsT;
      const firstYtext = Yjs.getText(firstNodeId);
      expect(firstYtext.toString()).toBe("");
    }).pipe(runtime.runPromise);
  });

  it("Backspace in block selection mode cleans up Yjs text", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First" }, { text: "Block to delete" }],
      );

      const [, secondNodeId] = childNodeIds;
      const secondBlockId = Id.makeBlockId(bufferId, secondNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Enter block selection mode on Second
      yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [secondNodeId]);

      // Press Backspace to delete the block
      yield* When.USER_PRESSES("{Backspace}");

      // Verify Yjs text is cleaned up for the deleted node
      const Yjs = yield* YjsT;
      const secondYtext = Yjs.getText(secondNodeId);
      expect(secondYtext.toString()).toBe("");
    }).pipe(runtime.runPromise);
  });

  it("deleting multiple blocks cleans up Yjs text for all", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "First to delete" },
          { text: "Second to delete" },
          { text: "Third remains" },
        ],
      );

      const [firstNodeId, secondNodeId, thirdNodeId] = childNodeIds;
      const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Select first two blocks
      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [firstNodeId, secondNodeId]);

      // Press Delete to delete both blocks
      yield* When.USER_PRESSES("{Delete}");

      // Verify Yjs text is cleaned up for both deleted nodes
      const Yjs = yield* YjsT;
      expect(Yjs.getText(firstNodeId).toString()).toBe("");
      expect(Yjs.getText(secondNodeId).toString()).toBe("");

      // Third block's text should still be there
      expect(Yjs.getText(thirdNodeId).toString()).toBe("Third remains");
    }).pipe(runtime.runPromise);
  });
});
