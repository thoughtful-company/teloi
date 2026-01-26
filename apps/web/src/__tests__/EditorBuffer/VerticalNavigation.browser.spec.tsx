import "@/index.css";
import { Id } from "@/schema";
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

describe("Vertical Navigation (ArrowUp/ArrowDown)", () => {
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

  describe("basic sibling traversal", () => {
    it("ArrowUp moves to previous sibling when on first line", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "First" }, { text: "Second" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );
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

    it("ArrowDown moves to next sibling when on last line", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "First" }, { text: "Second" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );
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
  });

  describe("title navigation", () => {
    it("ArrowUp moves to title when at first block", async () => {
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

    it("ArrowDown moves from title to first block", async () => {
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

    it("ArrowDown preserves goalX when navigating from wrapped title to block", async () => {
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

        yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 29);

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
  });

  describe("column & goalX preservation", () => {
    it("ArrowUp preserves column when target block's last line is long enough", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "LongFirstBlock" }, { text: "Short" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );
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

    it("ArrowDown preserves column when target block's first line is long enough", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Short" }, { text: "LongSecondBlock" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );
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

    it("ArrowUp clamps to end of line when target is shorter", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hi" }, { text: "LongerText" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );
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

    it("ArrowDown clamps to end of line when target is shorter", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "LongerText" }, { text: "Hi" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );
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

    it("ArrowUp maintains goalX through nested navigation", async () => {
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

    it("ArrowDown maintains goalX through nested navigation", async () => {
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

        yield* Given.BLOCK_IS_FOCUSED_AT(nestedBlockId, 5);

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

    it("ArrowUp maintains visual X with non-monospace fonts (iii vs WWW)", async () => {
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

    it("ArrowDown maintains visual X with non-monospace fonts (iii vs WWW)", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "WW" }, { text: "iiiiiiiiii" }],
        );

        const firstChildBlockId = Id.makeBufferBlockId(
          bufferId,
          childNodeIds[0],
        );

        render(() => <EditorBuffer bufferId={bufferId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 2);

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

    it("ArrowUp preserves goalX across multiple presses through shorter blocks", async () => {
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

    it("horizontal navigation clears goalX", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Text" }, { text: "Long text" }],
        );

        const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
        const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

        render(() => <EditorBuffer bufferId={bufferId} />);

        // Step 1: Focus second block, cursor at end (offset 9)
        yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 9);

        // Step 2: Press ArrowUp → cursor goes to end of "Text" (offset 4), goalX is set
        yield* When.USER_PRESSES("{ArrowUp}");
        yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

        // Step 3: Press Cmd+Left → cursor goes to start of "Text" (offset 0)
        yield* When.USER_PRESSES("{Meta>}{ArrowLeft}{/Meta}");
        yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);

        // Step 4: Press ArrowDown → cursor SHOULD go to start of "Long text" (offset 0)
        yield* When.USER_PRESSES("{ArrowDown}");
        yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("wrapped & multi-line content", () => {
    it("ArrowUp navigates within multi-line block (newlines) before jumping", async () => {
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

    it("ArrowUp navigates within wrapped line before jumping", async () => {
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

    it("ArrowDown navigates within wrapped line before jumping", async () => {
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

    it("ArrowDown navigates within wrapped line from start of first visual line", async () => {
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

    it("ArrowUp moves to prev block when cursor is at end of first visual line", async () => {
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

    it("ArrowDown moves to next block when cursor is at start of last visual line", async () => {
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

        yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 10, 1);

        yield* When.USER_PRESSES("{ArrowDown}");

        yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      }).pipe(runtime.runPromise);
    });

    it("ArrowUp lands on last visual line of wrapping block", async () => {
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
  });

  describe("nested block hierarchy", () => {
    it("ArrowUp moves to deepest last child of previous sibling", async () => {
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

        const nestedChildBlockId = Id.makeBufferBlockId(
          bufferId,
          nestedChildId,
        );
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

    it("ArrowUp moves to parent when at first child", async () => {
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

    it("ArrowDown moves to first child when block has children", async () => {
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

    it("ArrowDown moves to parent's next sibling when at last child", async () => {
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

        const nestedChildBlockId = Id.makeBufferBlockId(
          bufferId,
          nestedChildId,
        );
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
  });

  describe("boundary behavior", () => {
    it("ArrowDown at last block moves cursor to end of block", async () => {
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
  });
});
