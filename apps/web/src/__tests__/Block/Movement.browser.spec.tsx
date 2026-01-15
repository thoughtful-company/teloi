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

  describe("Hybrid Boundary Movement", () => {
    /**
     * HYBRID boundary behavior when moving at sibling boundaries:
     *
     * 1. If parent HAS sibling in direction → Move to that sibling (cross-parent)
     * 2. If parent has NO sibling in direction → Outdent (become sibling of parent)
     *
     * Move Down at last position:
     * - Parent has next sibling → become FIRST CHILD of that sibling (cross-parent)
     * - Parent has NO next sibling → become sibling AFTER parent (outdent)
     *
     * Move Up at first position:
     * - Parent has prev sibling → become LAST CHILD of that sibling (cross-parent)
     * - Parent has NO prev sibling → become sibling BEFORE parent (outdent)
     */

    describe("Move Down - Cross-Parent (Parent Has Next Sibling)", () => {
      it("last child crosses to become first child of parent's next sibling", async () => {
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

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child C (last child of Parent A)
          // Parent A has next sibling (Parent D), so cross-parent move
          yield* When.USER_CLICKS_BLOCK(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Child C should become first child of Parent D (cross-parent)
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childC]);
          yield* Then.SELECTION_IS_ON_BLOCK(childCBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Down - Outdent (Parent Has No Next Sibling)", () => {
      it("last child outdents to become sibling after parent when no next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
            ]);

          const [parentA] = childNodeIds;

          // Add children to Parent A (which has no next sibling at root level)
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

          // Focus on Child C (last child of Parent A)
          // Parent A has no next sibling, so outdent
          yield* When.USER_CLICKS_BLOCK(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Child C should outdent to become sibling after Parent A
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [parentA, childC]);
          yield* Then.SELECTION_IS_ON_BLOCK(childCBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Up - Cross-Parent (Parent Has Previous Sibling)", () => {
      it("first child crosses to become last child of parent's previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          // Add child to Parent D
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child E (first child of Parent D)
          // Parent D has prev sibling (Parent A), so cross-parent move
          yield* When.USER_CLICKS_BLOCK(childEBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Child E should become last child of Parent A (cross-parent)
          yield* Then.CHILDREN_ORDER_IS(parentD, []);
          yield* Then.CHILDREN_ORDER_IS(parentA, [childE]);
          yield* Then.SELECTION_IS_ON_BLOCK(childEBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Move Up - Outdent (Parent Has No Previous Sibling)", () => {
      it("first child outdents to become sibling before parent when no prev sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent D" },
            ]);

          const [parentD] = childNodeIds;

          // Add child to Parent D (which has no prev sibling at root level)
          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on Child E (first child of Parent D)
          // Parent D has no prev sibling, so outdent
          yield* When.USER_CLICKS_BLOCK(childEBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Child E should outdent to become sibling before Parent D
          yield* Then.CHILDREN_ORDER_IS(parentD, []);
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [childE, parentD]);
          yield* Then.SELECTION_IS_ON_BLOCK(childEBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Block Selection Mode - Cross-Parent", () => {
      it("single block crosses to next sibling on move down", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

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

          yield* When.USER_ENTERS_BLOCK_SELECTION(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Child C crosses to Parent D
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childC]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childC]);
        }).pipe(runtime.runPromise);
      });

      it("single block crosses to prev sibling on move up", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(childEBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Child E crosses to Parent A
          yield* Then.CHILDREN_ORDER_IS(parentD, []);
          yield* Then.CHILDREN_ORDER_IS(parentA, [childE]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childE]);
        }).pipe(runtime.runPromise);
      });

      it("multiple blocks cross to next sibling on move down", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

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

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Select C and F
          yield* When.USER_ENTERS_BLOCK_SELECTION(childCBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // C and F cross to Parent D
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(parentD, [childC, childF]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childC, childF]);
        }).pipe(runtime.runPromise);
      });

      it("multiple blocks cross to prev sibling on move up", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
              { text: "Parent D" },
            ]);

          const [parentA, parentD] = childNodeIds;

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

          // Select E and F
          yield* When.USER_ENTERS_BLOCK_SELECTION(childEBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // E and F cross to Parent A
          yield* Then.CHILDREN_ORDER_IS(parentD, [childG]);
          yield* Then.CHILDREN_ORDER_IS(parentA, [childE, childF]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childE, childF]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("Block Selection Mode - Outdent Fallback", () => {
      it("single block outdents on move down when no next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
            ]);

          const [parentA] = childNodeIds;

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

          yield* When.USER_ENTERS_BLOCK_SELECTION(childCBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Child C outdents to after Parent A
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [parentA, childC]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childC]);
        }).pipe(runtime.runPromise);
      });

      it("single block outdents on move up when no prev sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent D" },
            ]);

          const [parentD] = childNodeIds;

          const childE = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: parentD,
            insert: "after",
            text: "Child E",
          });

          const childEBlockId = Id.makeBlockId(bufferId, childE);

          render(() => <EditorBuffer bufferId={bufferId} />);

          yield* When.USER_ENTERS_BLOCK_SELECTION(childEBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Child E outdents to before Parent D
          yield* Then.CHILDREN_ORDER_IS(parentD, []);
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [childE, parentD]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childE]);
        }).pipe(runtime.runPromise);
      });

      it("multiple blocks outdent on move down when no next sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent A" },
            ]);

          const [parentA] = childNodeIds;

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

          const childCBlockId = Id.makeBlockId(bufferId, childC);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Select C and F
          yield* When.USER_ENTERS_BLOCK_SELECTION(childCBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // C and F outdent to after Parent A
          yield* Then.CHILDREN_ORDER_IS(parentA, [childB]);
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [parentA, childC, childF]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childC, childF]);
        }).pipe(runtime.runPromise);
      });

      it("multiple blocks outdent on move up when no prev sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Parent D" },
            ]);

          const [parentD] = childNodeIds;

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

          // Select E and F
          yield* When.USER_ENTERS_BLOCK_SELECTION(childEBlockId);
          yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // E and F outdent to before Parent D
          yield* Then.CHILDREN_ORDER_IS(parentD, [childG]);
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [childE, childF, parentD]);
          yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childE, childF]);
        }).pipe(runtime.runPromise);
      });
    });

    describe("No-op at Buffer Root", () => {
      it("move down does nothing when already at root level", async () => {
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
          // This should do nothing because root's children cannot cross-parent or outdent
          yield* When.USER_CLICKS_BLOCK(secondBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowDown}{/Meta}{/Alt}");

          // Order should be unchanged
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
        }).pipe(runtime.runPromise);
      });

      it("move up does nothing when already at root level", async () => {
        await Effect.gen(function* () {
          const { bufferId, rootNodeId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "First" },
              { text: "Second" },
            ]);

          const [first, second] = childNodeIds;
          const firstBlockId = Id.makeBlockId(bufferId, first);

          render(() => <EditorBuffer bufferId={bufferId} />);

          // Focus on First (first child of root) and try to move up
          // This should do nothing because root's children cannot cross-parent or outdent
          yield* When.USER_CLICKS_BLOCK(firstBlockId);
          yield* When.USER_PRESSES("{Alt>}{Meta>}{ArrowUp}{/Meta}{/Alt}");

          // Order should be unchanged
          yield* Then.CHILDREN_ORDER_IS(rootNodeId, [first, second]);
        }).pipe(runtime.runPromise);
      });
    });
  });
});
