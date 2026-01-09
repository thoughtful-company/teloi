import "@/index.css";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block ArrowDown key", () => {
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

  it("moves to next sibling when ArrowDown pressed on last line", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves column when target block's first line is long enough", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Short" }, { text: "LongSecondBlock" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(4);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
    }).pipe(runtime.runPromise);
  });

  it("clamps to end of line when target line is shorter than current column", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "LongerText" }, { text: "Hi" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(8);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
    }).pipe(runtime.runPromise);
  });

  it("moves to first child when current block has children", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Parent" }],
      );

      const childId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Child",
      });

      const parentBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent's next sibling when at last child", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const nestedChildBlockId = Id.makeBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(nestedChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("maintains goal X when traveling from sibling's nested child to next sibling", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second block here" }],
      );

      const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested child content",
      });

      const nestedBlockId = Id.makeBlockId(bufferId, nestedId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(nestedBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        return range.getBoundingClientRect().left;
      });

      yield* When.USER_PRESSES("{ArrowDown}");

      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          const range = sel.getRangeAt(0);
          return range.getBoundingClientRect().left;
        }),
      );

      const delta = Math.abs(xAfter - xBefore);
      expect(delta).toBeLessThan(5);
    }).pipe(runtime.runPromise);
  });

  it("maintains visual X position with non-monospace fonts (iii vs WWW)", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "WW" }, { text: "iiiiiiiiii" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(2);

      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        return rect.left;
      });

      yield* When.USER_PRESSES("{ArrowDown}");

      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          const range = sel.getRangeAt(0);
          return range.getBoundingClientRect().left;
        }),
      );

      const delta = Math.abs(xAfter - xBefore);
      expect(delta).toBeLessThan(5);
    }).pipe(runtime.runPromise);
  });

  it("navigates within wrapped line before jumping to next block", async () => {
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{Home}");
      yield* When.USER_PRESSES("{ArrowLeft}");
      yield* When.USER_PRESSES("{Home}");
      yield* When.USER_PRESSES("{End}");

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("navigates within wrapped line from START of first visual line", async () => {
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 0);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to next block when cursor is at start of last visual line", async () => {
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);

      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 10, 1);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves cursor to end of block when at last block and pressing ArrowDown", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "First block" }, { text: "Last block" }],
      );

      const lastBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(lastBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[1], 5);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(lastBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(10);
    }).pipe(runtime.runPromise);
  });

  it("moves from title to first block when ArrowDown pressed", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX when navigating DOWN from wrapped title to block", async () => {
    await Effect.gen(function* () {
      const Buffer = yield* BufferT;

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Once upon a midnight dreary",
        [
          { text: "While I nodded nearly napping" },
          { text: "Second block text here" },
        ],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(350);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_MOVES_CURSOR_TO(29);

      const xInBlock = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });
      console.log("xInBlock:", xInBlock);

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_TITLE(bufferId);

      const selInTitle = yield* Buffer.getSelection(bufferId);
      console.log(
        "Selection in title (should have goalX):",
        JSON.stringify(Option.getOrNull(selInTitle), null, 2),
      );

      yield* When.USER_PRESSES("{ArrowDown}");
      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      const selInBlock = yield* Buffer.getSelection(bufferId);
      console.log(
        "Selection after navigating back:",
        JSON.stringify(Option.getOrNull(selInBlock), null, 2),
      );

      const xAfter = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          return sel.getRangeAt(0).getBoundingClientRect().left;
        }),
      );
      console.log("xAfter:", xAfter);

      const delta = Math.abs(xAfter - xInBlock);
      expect(delta).toBeLessThan(10);
    }).pipe(runtime.runPromise);
  });
});
