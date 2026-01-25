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

describe("Block ArrowDown key", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
  });

  it("moves to next sibling when ArrowDown pressed on last line", async () => {
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

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 3);

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

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 4);

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

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 8);

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

      const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBufferBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 3);

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

      const nestedChildBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(nestedChildBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, nestedChildId, 3);

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

      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(nestedBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, nestedId, 5);

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

      yield* When.USER_PRESSES("{ArrowDown}");

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

  it("maintains visual X position with non-monospace fonts (iii vs WWW)", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "WW" }, { text: "iiiiiiiiii" }],
      );

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 2);

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

      yield* When.USER_PRESSES("{ArrowDown}");

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

  it("navigates within wrapped line before jumping to next block", async () => {
    await Effect.gen(function* () {
      const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Title",
        [{ text: wrappingText }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

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

      const lastBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

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
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
        ]);

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.SELECTION_IS_SET_TO(bufferId, rootNodeId, 5);

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
    }).pipe(runtime.runPromise);
  });

  it("preserves goalX when navigating DOWN from wrapped title to block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Once upon a midnight dreary",
        [
          { text: "While I nodded nearly napping" },
          { text: "Second block text here" },
        ],
      );

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(350);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 29);

      // Double-RAF to ensure CodeMirror has synced selection to browser and layout is complete
      const xInBlock = yield* Effect.promise(
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

      yield* Then.SELECTION_IS_ON_TITLE(bufferId);

      yield* When.USER_PRESSES("{ArrowDown}");
      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

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
      const delta = Math.abs(xAfter - xInBlock);
      expect(delta).toBeLessThan(10);
    }).pipe(runtime.runPromise);
  });

  it("clears goalX when horizontal navigation (Cmd+Left) is used", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Text" }, { text: "Long text" }],
      );

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Step 1: Click on second block, cursor at end (offset 9)
      yield* When.USER_CLICKS_BLOCK(secondBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[1], 9);

      // Step 2: Press ArrowUp → cursor goes to end of "Text" (offset 4), goalX is set
      yield* When.USER_PRESSES("{ArrowUp}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

      // Step 3: Press Cmd+Left → cursor goes to start of "Text" (offset 0)
      yield* When.USER_PRESSES("{Meta>}{ArrowLeft}{/Meta}");
      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);

      // Step 4: Press ArrowDown → cursor SHOULD go to start of "Long text" (offset 0)
      // BUG: goalX wasn't cleared, so it goes to offset ~4 instead
      yield* When.USER_PRESSES("{ArrowDown}");
      yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });
});
