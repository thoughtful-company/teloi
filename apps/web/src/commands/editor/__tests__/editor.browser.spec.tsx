import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";
import BufferView from "@/ui/BufferView";
import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

describe("editor navigation", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup) {
      await cleanup();
    }
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  describe("horizontal (ArrowLeft / ArrowRight)", () => {
    describe("ArrowLeft", () => {
      it("moves cursor left within text when not at start", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 3);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
        }).pipe(runtime.runPromise);
      });

      it("moves to previous sibling at end when at position 0", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
        }).pipe(runtime.runPromise);
      });

      it("moves to deepest visible child of previous sibling when it has children", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

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

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
        }).pipe(runtime.runPromise);
      });

      it("moves to parent when at first sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const childBlockId = Id.makeBufferBlockId(bufferId, childId);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
        }).pipe(runtime.runPromise);
      });

      it("moves to title when at first block in document", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_TITLE(bufferId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(14);
        }).pipe(runtime.runPromise);
      });

      it("skips hidden children when previous sibling is collapsed", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          const Block = yield* BlockT;
          yield* Block.setExpanded(firstBlockId, false);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          const Store = yield* StoreT;
          const bufferDoc = yield* Store.getDocument("buffer", bufferId);
          const buffer = Option.getOrThrow(bufferDoc);

          expect(buffer.selection).not.toBeNull();
          const expectedBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

          expect(
            buffer.selection!.focus.elementId,
            `Selection went to hidden Nested child instead of visible First block`,
          ).not.toBe(nestedBlockId);

          expect(
            buffer.selection!.focus.elementId,
            "Selection should be on First block (visible)",
          ).toBe(expectedBlockId);

          expect(buffer.selection!.focusOffset).toBe(5);
        }).pipe(runtime.runPromise);
      });
    });

    describe("ArrowRight", () => {
      it("moves cursor right within text when not at end", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 2);

          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);
        }).pipe(runtime.runPromise);
      });

      it("moves to next sibling at start when at end", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves to first child when block has children", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const childBlockId = Id.makeBufferBlockId(bufferId, childId);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves to parent's next sibling when last child", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedId);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(nestedBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves from title to first block", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* When.USER_CLICKS_TITLE(bufferId);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("skips hidden children when current block is collapsed", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          const Block = yield* BlockT;
          yield* Block.setExpanded(firstBlockId, false);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          const Store = yield* StoreT;
          const bufferDoc = yield* Store.getDocument("buffer", bufferId);
          const buffer = Option.getOrThrow(bufferDoc);

          expect(buffer.selection).not.toBeNull();
          const expectedBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );
          const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

          expect(buffer.selection!.focus.elementId).not.toBe(nestedBlockId);
          expect(buffer.selection!.focus.elementId).toBe(expectedBlockId);
          expect(buffer.selection!.focusOffset).toBe(0);
        }).pipe(runtime.runPromise);
      });
    });
  });

  describe.only("vertical (ArrowUp / ArrowDown)", () => {
    describe("basic sibling traversal", () => {
      it("ArrowUp moves to previous sibling when on first line", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to next sibling when on last line", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("title navigation", () => {
      it("ArrowUp moves to title when at first block", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

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

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.TITLE_IS_FOCUSED_AT(bufferId, rootNodeId, 5);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown preserves goalX when navigating from wrapped title to block", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Once upon a midnight dreary", [
              { text: "While I nodded nearly napping" },
              { text: "Second block text here" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(350);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 29);

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
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "LongFirstBlock" },
              { text: "Short" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 4);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown preserves column when target block's first line is long enough", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Short" },
              { text: "LongSecondBlock" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 4);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp clamps to end of line when target is shorter", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Hi" },
              { text: "LongerText" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 8);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown clamps to end of line when target is shorter", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "LongerText" },
              { text: "Hi" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 8);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp maintains goalX through nested navigation", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second block here" },
            ]);

          yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested child content",
          });

          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 5);

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
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second block here" },
            ]);

          const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested child content",
          });

          const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedId);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(nestedBlockId, 5);

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
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "iiiiiiiiii" },
              { text: "WW" },
            ]);

          const secondChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 2);

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
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "WW" },
              { text: "iiiiiiiiii" },
            ]);

          const firstChildBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[0],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 2);

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
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Long paragraph" },
              { text: "Short" },
              { text: "Long paragraph" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const thirdBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[2]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(thirdBlockId, 14);

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

      it("Cmd+ArrowLeft clears goalX", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Text" },
              { text: "Long text" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 9);

          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

          yield* When.USER_PRESSES("{Meta>}{ArrowLeft}{/Meta}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);

          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("plain ArrowLeft clears goalX", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Text" },
              { text: "Long text" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 9);

          // Establish goalX via vertical nav
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

          yield* When.USER_PRESSES("{ArrowLeft}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);

          // ArrowDown should start fresh from offset 3, not use stale goalX
          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);
        }).pipe(runtime.runPromise);
      });

      it("plain ArrowRight clears goalX", async () => {
        await Effect.gen(function* () {
          // Matching prefix ensures pixel mapping is exact for shared offsets
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Some text here" },
              { text: "Some text here plus more" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          // Start deep in secondBlock (offset 20) — stale goalX would land here
          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 20);

          // Establish goalX via vertical nav
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

          // ArrowLeft twice to move away from end-of-line, then ArrowRight
          yield* When.USER_PRESSES("{ArrowLeft}");
          yield* When.USER_PRESSES("{ArrowLeft}");
          yield* When.USER_PRESSES("{ArrowRight}");
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(13);

          // ArrowDown should use fresh goalX from offset 13, not stale from 20
          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(13);
        }).pipe(runtime.runPromise);
      });

      it("Home clears goalX", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Text" },
              { text: "Long text" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 4);

          // Establish goalX via vertical nav
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

          yield* When.USER_PRESSES("{Home}");
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);

          // ArrowDown should start fresh from offset 0
          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("End clears goalX", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Text" },
              { text: "Long second block text" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          // Start deep into secondBlock so stale goalX would be far right
          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 20);

          // Establish goalX via vertical nav
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

          yield* When.USER_PRESSES("{Home}");
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);

          yield* When.USER_PRESSES("{End}");
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);

          // ArrowDown from end of "Text" — should NOT use stale goalX (offset 20)
          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          // If stale goalX were used, we'd get offset 20.
          // End-of-line pixel mapping may give 3 or 4 — either proves goalX was cleared.
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);
        }).pipe(runtime.runPromise);
      });
    });

    describe("wrapped & multi-line content", () => {
      it("ArrowUp navigates within multi-line block (newlines) before jumping", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: "Line1\nLine2\nLine3" },
            ]);

          const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 14);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp navigates within wrapped line before jumping", async () => {
        await Effect.gen(function* () {
          const longText =
            "This is a very long text that will definitely wrap to multiple visual lines in the editor because it exceeds the container width and needs to flow onto subsequent rows";

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [{ text: longText }]);

          const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, longText.length - 10);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown navigates within wrapped line before jumping", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second block" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(100);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);
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

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second block" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(100);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp moves to prev block when cursor is at end of first visual line", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD";

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: "First block" },
              { text: wrappingText },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(100);
          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 10, -1);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to next block when cursor is at start of last visual line", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD";

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second block" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(100);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 10, 1);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp lands on last visual line of wrapping block", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD";

          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second" },
            ]);

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(800);
          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);

          yield* When.USER_PRESSES("{ArrowRight}");
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("Down then Up within wrapped text returns to original position", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
              { text: "Node A" },
              {
                text: "Історія Рекі нагадує, що ми не острови, що самотньо дрейфують у темряві. Ми — пов'язані невидимими та таємничими мостами довіри та емпатії. Її порятунок здобувся через нагороду за роки самопожертви, а став даром, отриманим в єдиний момент, коли вона дозволила собі бути вразливою перед кимось. Ми рятуємося не поодинці, а лише разом, стаючи одне для одного тим світлом, яке здатне розвіяти найтемнішу ніч душі.",
              },
            ]);

          const longTextBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BUFFER_HAS_WIDTH(800);

          yield* Given.BLOCK_IS_FOCUSED_AT(longTextBlockId, 0);
          yield* When.USER_PRESSES("{Meta>}{ArrowRight}{/Meta}");

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(longTextBlockId);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(longTextBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("nested block hierarchy", () => {
      it("ArrowUp moves to deepest last child of previous sibling", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

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

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp moves to parent when at first child", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const childBlockId = Id.makeBufferBlockId(bufferId, childId);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 3);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to first child when block has children", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
          const childBlockId = Id.makeBufferBlockId(bufferId, childId);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 3);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to parent's next sibling when at last child", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

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

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(nestedChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("boundary behavior", () => {
      it("ArrowDown at last block moves cursor to end of block", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Title", [
              { text: "First block" },
              { text: "Last block" },
            ]);

          const lastBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(lastBlockId, 5);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(lastBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(10);
        }).pipe(runtime.runPromise);
      });
    });

    describe.skip("collapsed block behavior", () => {
      it("ArrowDown skips hidden children when collapsed", async () => {
        await Effect.gen(function* () {
          const { bufferId, childNodeIds } =
            yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

          const Block = yield* BlockT;
          yield* Block.setExpanded(firstBlockId, false);

          render(() => <BufferView bufferId={bufferId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);
          yield* When.USER_PRESSES("{ArrowDown}");

          const Store = yield* StoreT;
          const bufferDoc = yield* Store.getDocument("buffer", bufferId);
          const buffer = Option.getOrThrow(bufferDoc);

          expect(buffer.selection).not.toBeNull();
          const expectedBlockId = Id.makeBufferBlockId(
            bufferId,
            childNodeIds[1],
          );
          const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

          expect(buffer.selection!.focus.elementId).not.toBe(nestedBlockId);
          expect(buffer.selection!.focus.elementId).toBe(expectedBlockId);
        }).pipe(runtime.runPromise);
      });
    });
  });

  describe("Home / End", () => {
    it("Home moves cursor to start of visual line", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello world" }],
        );

        const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

        render(() => <BufferView bufferId={bufferId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 5);

        yield* When.USER_PRESSES("{Home}");

        yield* Then.SELECTION_IS_ON_BLOCK(blockId);
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
      }).pipe(runtime.runPromise);
    });

    it("End moves cursor to end of visual line", async () => {
      await Effect.gen(function* () {
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Hello world" }],
        );

        const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

        render(() => <BufferView bufferId={bufferId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

        yield* When.USER_PRESSES("{End}");

        yield* Then.SELECTION_IS_ON_BLOCK(blockId);
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(11);
      }).pipe(runtime.runPromise);
    });
  });
});
