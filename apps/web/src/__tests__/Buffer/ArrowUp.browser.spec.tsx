import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
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

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
  });

  it("navigates within multi-line block (with newlines) before jumping to previous block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: "Line1\nLine2\nLine3" }],
      );

      const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 14);

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

      const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, longText.length - 10);

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

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 3);

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

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 4);

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

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 8);

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

      const nestedChildBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 3);

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

      const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBufferBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 3);

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

      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 5);

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xBefore = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                  throw new Error("No selection after double-RAF");
                }
                const range = sel.getRangeAt(0);
                resolve(range.getBoundingClientRect().left);
              });
            });
          }),
      );

      yield* When.USER_PRESSES("{ArrowUp}");

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xAfter = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                  throw new Error("No selection after double-RAF");
                }
                const range = sel.getRangeAt(0);
                resolve(range.getBoundingClientRect().left);
              });
            });
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

      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 2);

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xBefore = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                  throw new Error("No selection after double-RAF");
                }
                resolve(sel.getRangeAt(0).getBoundingClientRect().left);
              });
            });
          }),
      );

      yield* When.USER_PRESSES("{ArrowUp}");

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xAfter = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                  throw new Error("No selection after double-RAF");
                }
                resolve(sel.getRangeAt(0).getBoundingClientRect().left);
              });
            });
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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(100);
      yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 10, -1);

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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 5);

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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(800);
      yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);
      yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);

      yield* When.USER_PRESSES("{ArrowRight}");
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const thirdBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[2]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(thirdBlockId, 14);

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xInitial = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                  throw new Error("No selection after double-RAF");
                }
                resolve(sel.getRangeAt(0).getBoundingClientRect().left);
              });
            });
          }),
      );

      yield* When.USER_PRESSES("{ArrowUp}");
      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xFinal = yield* Effect.promise(
        () =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const sel = window.getSelection();
                if (!sel || sel.rangeCount === 0) {
                  throw new Error("No selection after double-RAF");
                }
                resolve(sel.getRangeAt(0).getBoundingClientRect().left);
              });
            });
          }),
      );

      const delta = Math.abs(xFinal - xInitial);
      expect(delta).toBeLessThan(5);

      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(14);
    }).pipe(runtime.runPromise);
  });
});
