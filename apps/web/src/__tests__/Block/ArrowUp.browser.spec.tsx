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

describe("Block ArrowUp key", () => {
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

  it("navigates within multi-line block (with newlines) before jumping to previous block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "Line1\nLine2\nLine3" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(14);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(blockId);
    }).pipe(runtime.runPromise);
  });

  it("navigates within wrapped line before jumping to previous block", async () => {
    await Effect.gen(function* () {
      const longText =
        "This is a very long text that will definitely wrap to multiple visual lines in the editor because it exceeds the container width and needs to flow onto subsequent rows";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: longText }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.USER_MOVES_CURSOR_TO(longText.length - 10);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(blockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to previous sibling when ArrowUp pressed on first line", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves column when target block's last line is long enough", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "LongFirstBlock" }, { text: "Short" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(4);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
    }).pipe(runtime.runPromise);
  });

  it("clamps to end of line when target line is shorter than current column", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hi" }, { text: "LongerText" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(8);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
    }).pipe(runtime.runPromise);
  });

  it("moves to deepest last child of previous sibling when it has children", async () => {
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

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent when at first child", async () => {
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

      yield* When.USER_CLICKS_BLOCK(childBlockId);
      yield* When.USER_MOVES_CURSOR_TO(3);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
    }).pipe(runtime.runPromise);
  });

  it("maintains goal X when traveling from sibling to previous block's nested child", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second block here" }],
      );

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested child content",
      });

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        return range.getBoundingClientRect().left;
      });

      yield* When.USER_PRESSES("{ArrowUp}");

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
        [{ text: "iiiiiiiiii" }, { text: "WW" }],
      );

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(2);

      const xBefore = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        return rect.left;
      });

      yield* When.USER_PRESSES("{ArrowUp}");

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

  it("moves to prev block when cursor is at end of first visual line", async () => {
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "First block" }, { text: wrappingText }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);

      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[1], 10, -1);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("moves to title when at first block in document", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_TITLE(bufferId);
    }).pipe(runtime.runPromise);
  });

  it("lands on last visual line of wrapping block when navigating up", async () => {
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX when title WRAPS to multiple visual lines", async () => {
    await Effect.gen(function* () {
      const Buffer = yield* BufferT;

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Once upon a midnight dreary",
        [{ text: "While" }, { text: "I pondered weak and" }],
      );

      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(350);

      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.USER_MOVES_CURSOR_TO(19);

      const xInBlock = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });
      console.log("xInBlock:", xInBlock);

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_TITLE(bufferId);

      const selInTitle = yield* Buffer.getSelection(bufferId);
      console.log(
        "Selection in title:",
        JSON.stringify(Option.getOrNull(selInTitle), null, 2),
      );

      const { xInTitle, yInTitle, offset } = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          return {
            xInTitle: rect.left,
            yInTitle: rect.top,
            offset: sel.anchorOffset,
          };
        }),
      );

      const titleElement = yield* Effect.sync(() =>
        document.querySelector("[data-element-type='title'] .cm-content"),
      );
      const titleLineInfo = yield* Effect.sync(() => {
        if (!titleElement) return null;
        const range = document.createRange();
        const textNode = titleElement.querySelector(".cm-line")?.firstChild;
        if (!textNode) return null;

        range.setStart(textNode, 0);
        range.setEnd(textNode, 1);
        const firstCharY = range.getBoundingClientRect().top;

        const textLength = (textNode as Text).length;
        range.setStart(textNode, textLength - 1);
        range.setEnd(textNode, textLength);
        const lastCharY = range.getBoundingClientRect().top;

        return { firstCharY, lastCharY, wraps: firstCharY !== lastCharY };
      });

      console.log(
        "xInTitle:",
        xInTitle,
        "yInTitle:",
        yInTitle,
        "offset:",
        offset,
      );
      console.log("Title wrapping info:", titleLineInfo);
      console.log("Delta:", Math.abs(xInTitle - xInBlock));

      const delta = Math.abs(xInTitle - xInBlock);
      expect(delta).toBeLessThan(10);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX across multiple ArrowUp presses through shorter blocks", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [
          { text: "Long paragraph" },
          { text: "Short" },
          { text: "Long paragraph" },
        ],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const thirdBlockId = Id.makeBlockId(bufferId, childNodeIds[2]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(thirdBlockId);
      yield* When.USER_MOVES_CURSOR_TO(14);

      const xInitial = yield* Effect.sync(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        return sel.getRangeAt(0).getBoundingClientRect().left;
      });

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      const xFinal = yield* Effect.promise(() =>
        waitFor(() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) throw new Error("No selection");
          return sel.getRangeAt(0).getBoundingClientRect().left;
        }),
      );

      const delta = Math.abs(xFinal - xInitial);
      expect(delta).toBeLessThan(5);

      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(14);
    }).pipe(runtime.runPromise);
  });
});
