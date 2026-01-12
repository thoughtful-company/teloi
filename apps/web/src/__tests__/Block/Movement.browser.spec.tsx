import "@/index.css";
import { Id } from "@/schema";
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

describe("Block Movement", () => {
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

  describe("Swap Up (Opt+Cmd+Up)", () => {
    it("swaps block with previous sibling and preserves selection", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, first, third]);
        yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is first child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const firstBlockId = Id.makeBlockId(bufferId, first);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Swap Down (Opt+Cmd+Down)", () => {
    it("swaps block with next sibling and preserves selection", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, third, second]);
        yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is last child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Move to First (Shift+Opt+Cmd+Up)", () => {
    it("moves block to first position among siblings", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const thirdBlockId = Id.makeBlockId(bufferId, third);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(thirdBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [third, first, second]);
        yield* Then.SELECTION_IS_ON_BLOCK(thirdBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is already first child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const firstBlockId = Id.makeBlockId(bufferId, first);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Move to Last (Shift+Opt+Cmd+Down)", () => {
    it("moves block to last position among siblings", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [first, second, third] = childNodeIds;
        const firstBlockId = Id.makeBlockId(bufferId, first);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(firstBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, third, first]);
        yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
      }).pipe(runtime.runPromise);
    });

    it("does nothing when block is already last child", async () => {
      await Effect.gen(function* () {
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [first, second] = childNodeIds;
        const secondBlockId = Id.makeBlockId(bufferId, second);

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* When.USER_CLICKS_BLOCK(secondBlockId);
        yield* When.USER_PRESSES(
          "{Shift>}{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}{/Shift}",
        );

        yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Block Selection Mode", () => {
    describe("Swap Up (Opt+Cmd+Up)", () => {
      it("swaps single selected block with previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
            ]);

          const [first, second, third] = childNodeIds;
          const secondBlockId = Id.makeBlockId(bufferId, second);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, first, third]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [second]);
        }).pipe(runtime.runPromise);
      });

      it("swaps multiple selected blocks with previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
              { text: "Fourth" },
            ]);

          const [first, second, third, fourth] = childNodeIds;
          const secondBlockId = Id.makeBlockId(bufferId, second);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on second, extend to third
          yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // [A, B, C, D] → [B, C, A, D]
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, third, first, fourth]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [second, third]);
        }).pipe(runtime.runPromise);
      });

      it("does nothing when first block is selected", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
            ]);

          const [first, second] = childNodeIds;
          const firstBlockId = Id.makeBlockId(bufferId, first);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [first]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Swap Down (Opt+Cmd+Down)", () => {
      it("swaps single selected block with next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
            ]);

          const [first, second, third] = childNodeIds;
          const secondBlockId = Id.makeBlockId(bufferId, second);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, third, second]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [second]);
        }).pipe(runtime.runPromise);
      });

      it("swaps multiple selected blocks with next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
              { text: "Fourth" },
            ]);

          const [first, second, third, fourth] = childNodeIds;
          const secondBlockId = Id.makeBlockId(bufferId, second);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on second, extend to third
          yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // [A, B, C, D] → [A, D, B, C]
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, fourth, second, third]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [second, third]);
        }).pipe(runtime.runPromise);
      });

      it("does nothing when last block is selected", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
            ]);

          const [first, second] = childNodeIds;
          const secondBlockId = Id.makeBlockId(bufferId, second);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [second]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move to First (Shift+Opt+Cmd+Up)", () => {
      it("moves single selected block to first position", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
            ]);

          const [first, second, third] = childNodeIds;
          const thirdBlockId = Id.makeBlockId(bufferId, third);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(thirdBlockId);
          yield* When.USER_PRESSES(
            "{Shift>}{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}{/Shift}",
          );

          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [third, first, second]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [third]);
        }).pipe(runtime.runPromise);
      });

      it("moves multiple selected blocks to first position", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
              { text: "Fourth" },
            ]);

          const [first, second, third, fourth] = childNodeIds;
          const thirdBlockId = Id.makeBlockId(bufferId, third);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on third, extend to fourth
          yield* When.USER_ENTERS_BLOCK_SELECTION(thirdBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES(
            "{Shift>}{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}{/Shift}",
          );

          // [A, B, C, D] → [C, D, A, B]
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [third, fourth, first, second]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [third, fourth]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move to Last (Shift+Opt+Cmd+Down)", () => {
      it("moves single selected block to last position", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
            ]);

          const [first, second, third] = childNodeIds;
          const firstBlockId = Id.makeBlockId(bufferId, first);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
          yield* When.USER_PRESSES(
            "{Shift>}{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}{/Shift}",
          );

          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [second, third, first]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [first]);
        }).pipe(runtime.runPromise);
      });

      it("moves multiple selected blocks to last position", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
              { text: "Third" },
              { text: "Fourth" },
            ]);

          const [first, second, third, fourth] = childNodeIds;
          const firstBlockId = Id.makeBlockId(bufferId, first);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on first, extend to second
          yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES(
            "{Shift>}{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}{/Shift}",
          );

          // [A, B, C, D] → [C, D, A, B]
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [third, fourth, first, second]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [first, second]);
        }).pipe(runtime.runPromise);
      });
    });
  });

  describe("Cross-Parent Movement", () => {
    /**
     * Test structure for cross-parent tests:
     * Root (buffer root)
     * ├── Parent A
     * │   ├── Child B
     * │   └── Child C  ← at last position, move down should go to Parent D
     * └── Parent D
     *     └── Child E  ← at first position, move up should go to Parent A
     */

    describe("Move Down at Boundary (Text Editing Mode)", () => {
      it("last child moves down to become first child of next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });

          // Add child to Parent D
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child C (last child of Parent A)
          yield* When.USER_CLICKS_BLOCK(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Child C should now be first child of Parent D
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childC, childE]);
          yield* Then.SELECTION_IS_ON_BLOCK(childCBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Up at Boundary (Text Editing Mode)", () => {
      it("first child moves up to become last child of previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });

          // Add child to Parent D
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child E (first child of Parent D)
          yield* When.USER_CLICKS_BLOCK(childEBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Child E should now be last child of Parent A
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB, childC, childE]);
          yield* Then.CHILDREN_ORDER_IS(parentD, []);
          yield* Then.SELECTION_IS_ON_BLOCK(childEBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Down at Boundary (Block Selection Mode - Single Block)", () => {
      it("single selected block moves to become first child of next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });

          // Add child to Parent D
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on Child C
          yield* When.USER_ENTERS_BLOCK_SELECTION(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Child C should now be first child of Parent D
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childC, childE]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childC]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Up at Boundary (Block Selection Mode - Single Block)", () => {
      it("single selected block moves to become last child of previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });

          // Add child to Parent D
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on Child E
          yield* When.USER_ENTERS_BLOCK_SELECTION(childEBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Child E should now be last child of Parent A
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB, childC, childE]);
          yield* Then.CHILDREN_ORDER_IS(parentD, []);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childE]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Down at Boundary (Block Selection Mode - Multi Block)", () => {
      it("multiple selected blocks move together to become first children of next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add children to Parent A: B, C, F
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });
          const childF = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childC,
            text: "Child F",
          });

          // Add child to Parent D
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on Child C, extend to Child F
          yield* When.USER_ENTERS_BLOCK_SELECTION(childCBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // C and F should now be first children of Parent D (before E)
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childC, childF, childE]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childC, childF]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Up at Boundary (Block Selection Mode - Multi Block)", () => {
      it("multiple selected blocks move together to become last children of previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });

          // Add children to Parent D: E, F, G
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });
          const childF = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            siblingId: childE,
            text: "Child F",
          });
          const childG = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            siblingId: childF,
            text: "Child G",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Enter block selection on Child E, extend to Child F
          yield* When.USER_ENTERS_BLOCK_SELECTION(childEBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // E and F should now be last children of Parent A (after B)
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB, childE, childF]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childG]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childE, childF]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("No-op Cases", () => {
      it("move down does nothing when no next sibling exists", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
            ]);

          const [parentA] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child C and try to move down
          yield* When.USER_CLICKS_BLOCK(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Nothing should change - Parent A is last sibling
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB, childC]);
          yield* Then.SELECTION_IS_ON_BLOCK(childCBlockId);
        }).pipe(runtime.runPromise);
      });

      it("move up does nothing when no previous sibling exists", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
            ]);

          const [parentA] = childNodeIds;

          // Add children to Parent A
          const childB = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            text: "Child B",
          });
          const childC = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentA,
            insert: "after",
            siblingId: childB,
            text: "Child C",
          });

          const childBBlockId = Id.makeBlockId(bufferId, childB);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child B and try to move up
          yield* When.USER_CLICKS_BLOCK(childBBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Nothing should change - Parent A is first sibling (no previous)
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB, childC]);
          yield* Then.SELECTION_IS_ON_BLOCK(childBBlockId);
        }).pipe(runtime.runPromise);
      });

      it("move down does nothing for buffer direct children", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
            ]);

          const [first, second] = childNodeIds;
          const secondBlockId = Id.makeBlockId(bufferId, second);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Second (last child of root) and try to move down
          // This should do nothing because root's children have no parent siblings
          yield* When.USER_CLICKS_BLOCK(secondBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Order should be unchanged (just swap with next sibling, no cross-parent)
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
        }).pipe(runtime.runPromise);
      });
    });
  });
});
