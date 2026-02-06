import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";
import FrameView from "@/ui/FrameView";
import { doubleRaf } from "@/utils/effect";
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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 3);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
        }).pipe(runtime.runPromise);
      });

      it("moves to previous sibling at end when at position 0", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
        }).pipe(runtime.runPromise);
      });

      it("moves to deepest visible child of previous sibling when it has children", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const nestedChildBlockId = Id.makeFrameBlockId(
            frameId,
            nestedChildId,
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
        }).pipe(runtime.runPromise);
      });

      it("moves to parent when at first sibling", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const childBlockId = Id.makeFrameBlockId(frameId, childId);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
        }).pipe(runtime.runPromise);
      });

      it("moves to title when at first block in document", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          yield* Then.SELECTION_IS_ON_TITLE(frameId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(14);
        }).pipe(runtime.runPromise);
      });

      it("skips hidden children when previous sibling is collapsed", async () => {
        await Effect.gen(function* () {
          const { frameId, windowId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          const Block = yield* BlockT;
          yield* Block.setExpanded(firstBlockId, false);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);

          yield* When.USER_PRESSES("{ArrowLeft}");

          const Store = yield* StoreT;
          const winDoc = Option.getOrThrow(
            yield* Store.getDocument("window", windowId),
          );

          expect(winDoc.selection).not.toBeNull();
          const expectedBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const nestedBlockId = Id.makeFrameBlockId(frameId, nestedChildId);

          expect(
            winDoc.selection!.focus.elementId,
            `Selection went to hidden Nested child instead of visible First block`,
          ).not.toBe(nestedBlockId);

          expect(
            winDoc.selection!.focus.elementId,
            "Selection should be on First block (visible)",
          ).toBe(expectedBlockId);

          expect(winDoc.selection!.focusOffset).toBe(5);
        }).pipe(runtime.runPromise);
      });
    });

    describe("ArrowRight", () => {
      it("moves cursor right within text when not at end", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Hello" },
            ]);

          const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 2);

          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);
        }).pipe(runtime.runPromise);
      });

      it("moves to next sibling at start when at end", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves to first child when block has children", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const childBlockId = Id.makeFrameBlockId(frameId, childId);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves to parent's next sibling when last child", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const nestedBlockId = Id.makeFrameBlockId(frameId, nestedId);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(nestedBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves from title to first block", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* When.USER_CLICKS_TITLE(frameId);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("skips hidden children when current block is collapsed", async () => {
        await Effect.gen(function* () {
          const { frameId, windowId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          const Block = yield* BlockT;
          yield* Block.setExpanded(firstBlockId, false);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);
          yield* When.USER_PRESSES("{End}");
          yield* When.USER_PRESSES("{ArrowRight}");

          const Store = yield* StoreT;
          const winDoc = Option.getOrThrow(
            yield* Store.getDocument("window", windowId),
          );

          expect(winDoc.selection).not.toBeNull();
          const expectedBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );
          const nestedBlockId = Id.makeFrameBlockId(frameId, nestedChildId);

          expect(winDoc.selection!.focus.elementId).not.toBe(nestedBlockId);
          expect(winDoc.selection!.focus.elementId).toBe(expectedBlockId);
          expect(winDoc.selection!.focusOffset).toBe(0);
        }).pipe(runtime.runPromise);
      });
    });
  });

  describe("vertical (ArrowUp / ArrowDown)", () => {
    describe("basic sibling traversal", () => {
      it("ArrowUp moves to previous sibling when on first line", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to next sibling when on last line", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("title navigation", () => {
      it("ArrowUp moves to title when at first block", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 5);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_TITLE(frameId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves from title to first block", async () => {
        await Effect.gen(function* () {
          const { frameId, rootNodeId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Document Title", [
              { text: "First block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.TITLE_IS_FOCUSED_AT(frameId, rootNodeId, 5);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown preserves goalX when navigating from wrapped title to block", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Once upon a midnight dreary", [
              { text: "While I nodded nearly napping" },
              { text: "Second block text here" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(350);

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

          yield* Then.SELECTION_IS_ON_TITLE(frameId);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "LongFirstBlock" },
              { text: "Short" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 4);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown preserves column when target block's first line is long enough", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Short" },
              { text: "LongSecondBlock" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 4);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(4);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp clamps to end of line when target is shorter", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Hi" },
              { text: "LongerText" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 8);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown clamps to end of line when target is shorter", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "LongerText" },
              { text: "Hi" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 8);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(2);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp maintains goalX through nested navigation", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second block here" },
            ]);

          yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested child content",
          });

          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second block here" },
            ]);

          const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested child content",
          });

          const nestedBlockId = Id.makeFrameBlockId(frameId, nestedId);

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "iiiiiiiiii" },
              { text: "WW" },
            ]);

          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "WW" },
              { text: "iiiiiiiiii" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Long paragraph" },
              { text: "Short" },
              { text: "Long paragraph" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const thirdBlockId = Id.makeFrameBlockId(frameId, childNodeIds[2]);

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Text" },
              { text: "Long text" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

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

      it("Cmd+ArrowRight clears goalX", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Text here" },
              { text: "Long text here too" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 18);

          // Establish goalX via vertical nav
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(9);

          // Cmd+Left to go to start, then Cmd+Right to line end — clears goalX
          yield* When.USER_PRESSES("{Meta>}{ArrowLeft}{/Meta}");
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);

          yield* When.USER_PRESSES("{Meta>}{ArrowRight}{/Meta}");
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(9);

          // ArrowDown should start fresh from offset 9, not use stale goalX (18)
          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(9);
        }).pipe(runtime.runPromise);
      });

      it("Cmd+ArrowRight moves to end of visual line (not next line) when text wraps", async () => {
        await Effect.gen(function* () {
          // Text long enough to wrap at ~200px width
          const longText =
            "The quick brown fox jumps over the lazy dog and keeps on running";

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: longText },
            ]);

          const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          // Constrain width to force wrapping
          yield* Given.FRAME_HAS_WIDTH(200);

          // Place cursor near the start of the first visual line (offset 5)
          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 5);

          // Read CodeMirror state before the move
          yield* doubleRaf;
          const viewBefore = Then.getCodeMirrorView()!;
          const selBefore = viewBefore.state.selection.main;
          const coordsBefore = viewBefore.coordsAtPos(selBefore.head);

          // Press Cmd+Right
          yield* When.USER_PRESSES("{Meta>}{ArrowRight}{/Meta}");

          // Read CodeMirror state after the move
          yield* doubleRaf;
          const viewAfter = Then.getCodeMirrorView()!;
          const selAfter = viewAfter.state.selection.main;
          const coordsAfter = viewAfter.coordsAtPos(
            selAfter.head,
            selAfter.assoc === 1 ? 1 : -1,
          );

          // The cursor should NOT have moved to a different visual line
          expect(coordsBefore).not.toBeNull();
          expect(coordsAfter).not.toBeNull();
          expect(
            Math.abs(coordsAfter!.top - coordsBefore!.top),
            `Cmd+Right should stay on the same visual line (Y before: ${coordsBefore!.top}, Y after: ${coordsAfter!.top})`,
          ).toBeLessThan(2);

          // The cursor should have moved forward (not stayed in place)
          expect(
            selAfter.head,
            "cursor should have moved forward",
          ).toBeGreaterThan(selBefore.head);

          // The cursor should NOT be at doc end (that would mean it jumped to the logical end)
          expect(
            selAfter.head,
            "cursor should not jump to logical line end",
          ).toBeLessThan(viewAfter.state.doc.length);

          // assoc should be -1 (end of visual line, not start of next)
          expect(selAfter.assoc, "assoc should be -1 at visual line end").toBe(
            -1,
          );
        }).pipe(runtime.runPromise);
      });

      it("Alt+ArrowLeft clears goalX", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "some text" },
              { text: "longer text here" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 16);

          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

          yield* When.USER_PRESSES("{Alt>}{ArrowLeft}{/Alt}");

          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
        }).pipe(runtime.runPromise);
      });

      it("Alt+ArrowRight clears goalX", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "some text" },
              { text: "longer text here" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 16);

          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

          yield* When.USER_PRESSES("{Alt>}{ArrowRight}{/Alt}");

          yield* When.USER_PRESSES("{ArrowDown}");
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
        }).pipe(runtime.runPromise);
      });

      it("plain ArrowLeft clears goalX", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Text" },
              { text: "Long text" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Some text here" },
              { text: "Some text here plus more" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

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

      describe("delete commands clear goalX", () => {
        it("Cmd+Backspace (deleteToLineStart) deletes to visual line start, not logical line start", async () => {
          await Effect.gen(function* () {
            const longText =
              "Hmmm. A little boy went out to play. When he opened his door, he saw the world. As he passed through the doorway, he caused a reflection. Evil was born. Evil was born, and followed the boy.An old tale, and a variation. A little girl went out to play. Lost in the marketplace, as if half-born. Then, not through the marketplace - you see that, don't you? - but through the alley behind the marketplace. This is the way to the palace. But it isn't something you remember.";
            const { frameId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: longText },
              ]);

            const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

            render(() => <FrameView frameId={frameId} />);
            yield* Given.FRAME_HAS_WIDTH(400);

            // Place cursor at end of visual line 2
            yield* Given.BLOCK_IS_FOCUSED_AT_VISUAL_LINE(blockId, {
              line: 2,
              side: "end",
            });

            const { offset: visualLine2Start } =
              yield* Given.VISUAL_LINE_OFFSET(blockId, {
                line: 2,
                side: "start",
              });
            expect(
              visualLine2Start,
              "visual line 2 start should not be 0",
            ).toBeGreaterThan(0);

            // Cmd+Backspace should delete to visual line 2 start only
            yield* When.USER_PRESSES("{Meta>}{Backspace}{/Meta}");
            yield* Then.SELECTION_IS_ON_BLOCK(blockId);

            // Cursor lands at visual line 2 start — NOT at 0
            yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(visualLine2Start);
          }).pipe(runtime.runPromise);
        });

        it("Cmd+Backspace at visual line start deletes previous visual line", async () => {
          await Effect.gen(function* () {
            const longText =
              "Hmmm. A little boy went out to play. When he opened his door, he saw the world. As he passed through the doorway, he caused a reflection. Evil was born. Evil was born, and followed the boy.An old tale, and a variation. A little girl went out to play. Lost in the marketplace, as if half-born. Then, not through the marketplace - you see that, don't you? - but through the alley behind the marketplace. This is the way to the palace. But it isn't something you remember.";
            const { frameId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: longText },
              ]);

            const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

            render(() => <FrameView frameId={frameId} />);
            yield* Given.FRAME_HAS_WIDTH(400);

            // Place cursor at start of visual line 2 (the wrap point)
            yield* Given.BLOCK_IS_FOCUSED_AT_VISUAL_LINE(blockId, {
              line: 2,
              side: "start",
            });

            const { offset: visualLine2Start } =
              yield* Given.VISUAL_LINE_OFFSET(blockId, {
                line: 2,
                side: "start",
              });
            expect(
              visualLine2Start,
              "visual line 2 start should not be 0",
            ).toBeGreaterThan(0);

            // Cmd+Backspace at a visual line boundary should delete the entire previous visual line
            yield* When.USER_PRESSES("{Meta>}{Backspace}{/Meta}");
            yield* Then.SELECTION_IS_ON_BLOCK(blockId);

            // Cursor lands at offset 0 — the previous visual line was fully deleted
            yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
          }).pipe(runtime.runPromise);
        });

        it("Cmd+Delete (deleteToLineEnd) deletes to visual line end, not logical line end", async () => {
          await Effect.gen(function* () {
            const longText =
              "Hmmm. A little boy went out to play. When he opened his door, he saw the world. As he passed through the doorway, he caused a reflection. Evil was born. Evil was born, and followed the boy.An old tale, and a variation. A little girl went out to play. Lost in the marketplace, as if half-born. Then, not through the marketplace - you see that, don't you? - but through the alley behind the marketplace. This is the way to the palace. But it isn't something you remember.";
            const { frameId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: longText },
              ]);

            const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

            render(() => <FrameView frameId={frameId} />);
            yield* Given.FRAME_HAS_WIDTH(400);

            // Place cursor at start of visual line 2
            yield* Given.BLOCK_IS_FOCUSED_AT_VISUAL_LINE(blockId, {
              line: 2,
              side: "start",
            });

            const { offset: visualLine2End } = yield* Given.VISUAL_LINE_OFFSET(
              blockId,
              {
                line: 2,
                side: "end",
              },
            );
            expect(
              visualLine2End,
              "visual line 2 end should be less than total doc length",
            ).toBeLessThan(longText.length);

            const { offset: cursorOffset } = yield* Given.VISUAL_LINE_OFFSET(
              blockId,
              {
                line: 2,
                side: "start",
              },
            );
            const deletedChars = visualLine2End - cursorOffset;

            // Cmd+Delete should delete to visual line 2 end only
            yield* When.USER_PRESSES("{Meta>}{Delete}{/Meta}");
            yield* Then.SELECTION_IS_ON_BLOCK(blockId);

            // Cursor stays at visual line 2 start — text after cursor was removed
            yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(cursorOffset);

            // Doc shrank by exactly the visual line 2 content (not the entire rest of the doc)
            yield* doubleRaf;
            const view = Then.getCodeMirrorView()!;
            expect(view.state.doc.length).toBe(longText.length - deletedChars);
          }).pipe(runtime.runPromise);
        });

        it("Cmd+Backspace (deleteToLineStart) clears goalX", async () => {
          await Effect.gen(function* () {
            const { frameId, windowId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: "hello world test" },
                { text: "ab" },
              ]);

            const firstBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[0],
            );
            const secondBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[1],
            );

            render(() => <FrameView frameId={frameId} />);

            // Start at end of second (shorter) block
            yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 2);

            // ArrowUp establishes goalX; cursor lands at ~offset 2 in first block
            yield* When.USER_PRESSES("{ArrowUp}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // Verify goalX is set (non-null) after vertical nav
            const Store = yield* StoreT;
            const winBefore = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winBefore.selection!.goalX,
              "goalX should be set after ArrowUp",
            ).not.toBeNull();

            // Cmd+Backspace deletes from cursor to line start
            yield* When.USER_PRESSES("{Meta>}{Backspace}{/Meta}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // goalX should now be cleared
            const winAfter = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winAfter.selection!.goalX,
              "goalX should be null after Cmd+Backspace",
            ).toBeNull();

            // ArrowDown without goalX should land at offset 0 (no remembered X)
            yield* When.USER_PRESSES("{ArrowDown}");
            yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
            yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
          }).pipe(runtime.runPromise);
        });

        it("Cmd+Delete (deleteToLineEnd) clears goalX", async () => {
          await Effect.gen(function* () {
            const { frameId, windowId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: "hello world test" },
                { text: "ab" },
              ]);

            const firstBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[0],
            );
            const secondBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[1],
            );

            render(() => <FrameView frameId={frameId} />);

            // Start at end of second (shorter) block
            yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 2);

            // ArrowUp establishes goalX; cursor lands at ~offset 2 in first block
            yield* When.USER_PRESSES("{ArrowUp}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // Verify goalX is set (non-null) after vertical nav
            const Store = yield* StoreT;
            const winBefore = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winBefore.selection!.goalX,
              "goalX should be set after ArrowUp",
            ).not.toBeNull();

            // Cmd+Delete deletes from cursor to end: removes most text, cursor stays
            yield* When.USER_PRESSES("{Meta>}{Delete}{/Meta}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // goalX should now be cleared
            const winAfter = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winAfter.selection!.goalX,
              "goalX should be null after Cmd+Delete",
            ).toBeNull();
          }).pipe(runtime.runPromise);
        });

        it("Alt+Backspace (deleteWordBackward) clears goalX", async () => {
          await Effect.gen(function* () {
            const { frameId, windowId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: "hello world test" },
                { text: "ab" },
              ]);

            const firstBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[0],
            );
            const secondBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[1],
            );

            render(() => <FrameView frameId={frameId} />);

            yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 2);

            yield* When.USER_PRESSES("{ArrowUp}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // Verify goalX is set after vertical nav
            const Store = yield* StoreT;
            const winBefore = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winBefore.selection!.goalX,
              "goalX should be set after ArrowUp",
            ).not.toBeNull();

            // Alt+Backspace deletes word backward
            yield* When.USER_PRESSES("{Alt>}{Backspace}{/Alt}");

            // goalX should be cleared
            const winAfter = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winAfter.selection!.goalX,
              "goalX should be null after Alt+Backspace",
            ).toBeNull();
          }).pipe(runtime.runPromise);
        });

        it("Alt+Delete (deleteWordForward) clears goalX", async () => {
          await Effect.gen(function* () {
            const { frameId, windowId, childNodeIds } =
              yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
                { text: "hello world test" },
                { text: "ab" },
              ]);

            const firstBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[0],
            );
            const secondBlockId = Id.makeFrameBlockId(
              frameId,
              childNodeIds[1],
            );

            render(() => <FrameView frameId={frameId} />);

            // Start at end of second (shorter) block
            yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 2);

            // ArrowUp establishes goalX; cursor lands at ~offset 2 in first block
            yield* When.USER_PRESSES("{ArrowUp}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // Verify goalX is set (non-null) after vertical nav
            const Store = yield* StoreT;
            const winBefore = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winBefore.selection!.goalX,
              "goalX should be set after ArrowUp",
            ).not.toBeNull();

            // Alt+Delete deletes next word forward, cursor stays at same offset
            yield* When.USER_PRESSES("{Alt>}{Delete}{/Alt}");
            yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);

            // goalX should now be cleared
            const winAfter = Option.getOrThrow(
              yield* Store.getDocument("window", windowId),
            );
            expect(
              winAfter.selection!.goalX,
              "goalX should be null after Alt+Delete",
            ).toBeNull();
          }).pipe(runtime.runPromise);
        });
      });
    });

    describe("wrapped & multi-line content", () => {
      it("ArrowUp navigates within multi-line block (newlines) before jumping", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: "Line1\nLine2\nLine3" },
            ]);

          const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 14);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp navigates within wrapped line before jumping", async () => {
        await Effect.gen(function* () {
          const longText =
            "This is a very long text that will definitely wrap to multiple visual lines in the editor because it exceeds the container width and needs to flow onto subsequent rows";

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [{ text: longText }]);

          const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(blockId, longText.length - 10);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(blockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown navigates within wrapped line before jumping", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD EEEE";

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(100);

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

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(100);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp moves to prev block when cursor is at end of first visual line", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD";

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: "First block" },
              { text: wrappingText },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(100);
          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 10, -1);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to next block when cursor is at start of last visual line", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD";

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second block" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(100);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 10, 1);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp lands on last visual line of wrapping block", async () => {
        await Effect.gen(function* () {
          const wrappingText = "AAAA BBBB CCCC DDDD";

          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: wrappingText },
              { text: "Second" },
            ]);

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const secondBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(800);
          yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);
          yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);

          yield* When.USER_PRESSES("{ArrowRight}");
          yield* When.USER_PRESSES("{ArrowUp}");
          yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
        }).pipe(runtime.runPromise);
      });

      it("Down then Up within wrapped text returns to original position", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root", [
              { text: "Node A" },
              {
                text: "Історія Рекі нагадує, що ми не острови, що самотньо дрейфують у темряві. Ми — пов'язані невидимими та таємничими мостами довіри та емпатії. Її порятунок здобувся через нагороду за роки самопожертви, а став даром, отриманим в єдиний момент, коли вона дозволила собі бути вразливою перед кимось. Ми рятуємося не поодинці, а лише разом, стаючи одне для одного тим світлом, яке здатне розвіяти найтемнішу ніч душі.",
              },
            ]);

          const longTextBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.FRAME_HAS_WIDTH(800);

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
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const nestedChildBlockId = Id.makeFrameBlockId(
            frameId,
            nestedChildId,
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowUp moves to parent when at first child", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const childBlockId = Id.makeFrameBlockId(frameId, childId);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 3);

          yield* When.USER_PRESSES("{ArrowUp}");

          yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to first child when block has children", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "Parent" },
            ]);

          const childId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Child",
          });

          const parentBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
          const childBlockId = Id.makeFrameBlockId(frameId, childId);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 3);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
        }).pipe(runtime.runPromise);
      });

      it("ArrowDown moves to parent's next sibling when at last child", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const nestedChildBlockId = Id.makeFrameBlockId(
            frameId,
            nestedChildId,
          );
          const secondChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(nestedChildBlockId, 3);

          yield* When.USER_PRESSES("{ArrowDown}");

          yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
        }).pipe(runtime.runPromise);
      });
    });

    describe("boundary behavior", () => {
      it("ArrowDown at last block moves cursor to end of block", async () => {
        await Effect.gen(function* () {
          const { frameId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Title", [
              { text: "First block" },
              { text: "Last block" },
            ]);

          const lastBlockId = Id.makeFrameBlockId(frameId, childNodeIds[1]);

          render(() => <FrameView frameId={frameId} />);

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
          const { frameId, windowId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First" },
              { text: "Second" },
            ]);

          const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
            parentId: childNodeIds[0],
            insert: "after",
            text: "Nested",
          });

          const firstBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          const Block = yield* BlockT;
          yield* Block.setExpanded(firstBlockId, false);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 0);
          yield* When.USER_PRESSES("{ArrowDown}");

          const Store = yield* StoreT;
          const winDoc = Option.getOrThrow(
            yield* Store.getDocument("window", windowId),
          );

          expect(winDoc.selection).not.toBeNull();
          const expectedBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[1],
          );
          const nestedBlockId = Id.makeFrameBlockId(frameId, nestedChildId);

          expect(winDoc.selection!.focus.elementId).not.toBe(nestedBlockId);
          expect(winDoc.selection!.focus.elementId).toBe(expectedBlockId);
        }).pipe(runtime.runPromise);
      });
    });
  });

  describe("Backspace", () => {
    it("merges with previous sibling when Backspace pressed at start", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const secondChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[1],
        );

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    it("places cursor at merge point after clicking different positions before merge", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "123" },
            { text: "12" },
          ]);

        const firstChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[0],
        );
        const secondChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[1],
        );

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 2);
        yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);

        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "12312");

        // Cursor should be at merge point (after "123" = position 3)
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);
      }).pipe(runtime.runPromise);
    });

    /**
     * - A
     *   - B
     * - |C     <- cursor at start
     *
     * After Backspace, should merge with visually previous block (B):
     * - A
     *   - BC   <- cursor after "B"
     */
    it("merges with last descendant of previous sibling when it has children", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "A" },
            { text: "C" },
          ]);

        const [nodeA, nodeC] = childNodeIds;

        const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "B",
        });

        const blockA = Id.makeFrameBlockId(frameId, nodeA);
        const blockC = Id.makeFrameBlockId(frameId, nodeC);

        render(() => <FrameView frameId={frameId} />);

        const Block = yield* BlockT;
        yield* Block.setExpanded(blockA, true);

        yield* Given.BLOCK_IS_FOCUSED_AT(blockC, 0);
        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
        yield* Then.NODE_HAS_CHILDREN(nodeA, 1);
        yield* Then.NODE_HAS_TEXT(nodeA, "A");
        yield* Then.NODE_HAS_TEXT(nodeB, "BC");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(1);
      }).pipe(runtime.runPromise);
    });

    /**
     * - Parent
     *   - |FirstChild   <- cursor at start, first sibling
     *
     * After Backspace, should merge into parent:
     * - ParentFirstChild   <- cursor after "Parent"
     */
    it("merges first child into parent when Backspace pressed at start", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Parent", [
            { text: "FirstChild" },
          ]);

        const [firstChildId] = childNodeIds;
        const firstChildBlockId = Id.makeFrameBlockId(frameId, firstChildId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);
        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
        yield* Then.NODE_HAS_TEXT(rootNodeId, "ParentFirstChild");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
      }).pipe(runtime.runPromise);
    });

    it("merges with previous sibling when Cmd+Backspace pressed at start", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const secondChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[1],
        );
        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
        yield* When.USER_PRESSES("{Meta>}{Backspace}{/Meta}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    it("merges with previous sibling when Alt+Backspace pressed at start", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const secondChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[1],
        );
        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
        yield* When.USER_PRESSES("{Alt>}{Backspace}{/Alt}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    /**
     * Structure:
     * Root
     * ├── First
     * ├── Second (cursor at start, HAS children)
     * │   └── Child
     * └── Third
     *
     * Cursor at start of Second, press Backspace.
     * Should be no-op because Second has children - deleting would orphan Child.
     */
    it("no-op when block has children (would orphan them)", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const [firstNodeId, secondNodeId, thirdNodeId] = childNodeIds;

        const childId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: secondNodeId,
          insert: "after",
          text: "Child",
        });

        const secondBlockId = Id.makeFrameBlockId(frameId, secondNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(secondBlockId, 0);
        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 3);
        yield* Then.NODE_HAS_TEXT(firstNodeId, "First");
        yield* Then.NODE_HAS_TEXT(secondNodeId, "Second");
        yield* Then.NODE_HAS_TEXT(thirdNodeId, "Third");

        yield* Then.NODE_HAS_CHILDREN(secondNodeId, 1);
        yield* Then.NODE_HAS_TEXT(childId, "Child");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
      }).pipe(runtime.runPromise);
    });

    it("removes ghost block and focuses parent on Backspace at start", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root node",
          [{ text: "Parent" }],
        );

        const parentNodeId = childNodeIds[0];
        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        // Expand the childless block to create a ghost
        yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 0);
        yield* When.USER_PRESSES("{Meta>}{ArrowDown}{/Meta}");

        // Ghost should be focused
        const Store = yield* StoreT;
        const blockDoc = yield* Store.getDocument("block", parentBlockId);
        const ghostChildId = Option.getOrThrow(blockDoc).ghostChildId!;
        const ghostBlockId = Id.makeFrameBlockId(
          frameId,
          ghostChildId as Id.Node,
        );
        yield* Then.SELECTION_IS_ON_BLOCK(ghostBlockId);

        // Backspace on empty ghost → remove ghost, focus parent at end
        yield* When.USER_PRESSES("{Backspace}");

        yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6); // "Parent".length

        // Ghost should be cleaned up
        const blockDocAfter = yield* Store.getDocument("block", parentBlockId);
        expect(Option.getOrThrow(blockDocAfter).ghostChildId).toBeNull();
      }).pipe(runtime.runPromise);
    });
  });

  describe("Delete", () => {
    /**
     * - First|   <- cursor at end
     * - Second
     *
     * After Delete, should merge with next sibling:
     * - First|Second   <- cursor after "First"
     */
    it("merges with next sibling when Delete pressed at end", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const firstChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[0],
        );

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 5);
        yield* When.USER_PRESSES("{Delete}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");

        yield* Then.TEXT_IS_VISIBLE("FirstSecond");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    /**
     * - Parent|     <- cursor at end (expanded)
     *   - FirstChild
     *
     * After Delete, should merge with first child:
     * - ParentFirstChild   <- cursor after "Parent"
     */
    it("merges with first child when Delete pressed at end of parent", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Root",
          [{ text: "Parent" }],
        );

        const [parentNodeId] = childNodeIds;

        yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "FirstChild",
        });

        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        const Block = yield* BlockT;
        yield* Block.setExpanded(parentBlockId, true);

        yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 6);
        yield* When.USER_PRESSES("{Delete}");

        yield* Then.NODE_HAS_CHILDREN(parentNodeId, 0);
        yield* Then.NODE_HAS_TEXT(parentNodeId, "ParentFirstChild");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
      }).pipe(runtime.runPromise);
    });

    /**
     * - A
     *   - B|   <- cursor at end, last child of A
     * - C
     *
     * Delete at last child should NOT cross hierarchy - it's a no-op.
     */
    it("does nothing when Delete pressed at end of last child (no hierarchy crossing)", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "A" },
            { text: "C" },
          ]);

        const [nodeA, nodeC] = childNodeIds;

        const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: nodeA,
          insert: "after",
          text: "B",
        });

        const blockA = Id.makeFrameBlockId(frameId, nodeA);
        const blockB = Id.makeFrameBlockId(frameId, nodeB);

        render(() => <FrameView frameId={frameId} />);

        const Block = yield* BlockT;
        yield* Block.setExpanded(blockA, true);

        yield* Given.BLOCK_IS_FOCUSED_AT(blockB, 1);
        yield* When.USER_PRESSES("{Delete}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
        yield* Then.NODE_HAS_CHILDREN(nodeA, 1);
        yield* Then.NODE_HAS_TEXT(nodeA, "A");
        yield* Then.NODE_HAS_TEXT(nodeB, "B");
        yield* Then.NODE_HAS_TEXT(nodeC, "C");

        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(1);
      }).pipe(runtime.runPromise);
    });

    it("merges with next sibling when Cmd+Delete pressed at end", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const firstChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[0],
        );
        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 5);
        yield* When.USER_PRESSES("{Meta>}{Delete}{/Meta}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    it("merges with next sibling when Alt+Delete pressed at end", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const firstChildBlockId = Id.makeFrameBlockId(
          frameId,
          childNodeIds[0],
        );
        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 5);
        yield* When.USER_PRESSES("{Alt>}{Delete}{/Alt}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

        const Node = yield* NodeT;
        const children = yield* Node.getNodeChildren(rootNodeId);
        yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    /**
     * Structure:
     * Root
     * ├── First (collapsed, with child Hidden)
     * │   └── Hidden (NOT visible)
     * └── Second
     *
     * Cursor at end of First, press Delete.
     * Should merge Second (NOT Hidden which is collapsed).
     */
    it("merges next sibling when collapsed with children", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [firstNodeId] = childNodeIds;

        const hiddenChildId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: firstNodeId,
          insert: "after",
          text: "Hidden",
        });

        const firstBlockId = Id.makeFrameBlockId(frameId, firstNodeId);

        const Block = yield* BlockT;
        yield* Block.setExpanded(firstBlockId, false);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 5);
        yield* When.USER_PRESSES("{Delete}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
        yield* Then.NODE_HAS_TEXT(firstNodeId, "FirstSecond");
        yield* Then.NODE_HAS_CHILDREN(firstNodeId, 1);
        yield* Then.NODE_HAS_TEXT(hiddenChildId, "Hidden");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });

    /**
     * Structure:
     * Root
     * └── Parent (expanded, with child that has grandchildren)
     *     └── Child
     *         └── Grandchild
     *
     * Cursor at end of Parent, press Delete.
     * Should be no-op because merging Child would orphan Grandchild.
     */
    it("no-op when first child has grandchildren (would orphan them)", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "Parent" },
          ]);

        const [parentNodeId] = childNodeIds;

        const childId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: parentNodeId,
          insert: "after",
          text: "Child",
        });

        const grandchildId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: childId,
          insert: "after",
          text: "Grandchild",
        });

        const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(parentBlockId, 6);
        yield* When.USER_PRESSES("{Delete}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
        yield* Then.NODE_HAS_TEXT(parentNodeId, "Parent");
        yield* Then.NODE_HAS_CHILDREN(parentNodeId, 1);
        yield* Then.NODE_HAS_TEXT(childId, "Child");
        yield* Then.NODE_HAS_CHILDREN(childId, 1);
        yield* Then.NODE_HAS_TEXT(grandchildId, "Grandchild");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
      }).pipe(runtime.runPromise);
    });

    /**
     * Structure:
     * Root
     * ├── First|        <- cursor at end
     * └── Second
     *     └── Nephew
     *
     * Cursor at end of First, press Delete.
     * Should be no-op because merging Second would orphan Nephew.
     */
    it("no-op when next sibling has children (would orphan nieces/nephews)", async () => {
      await Effect.gen(function* () {
        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
            { text: "First" },
            { text: "Second" },
          ]);

        const [firstNodeId, secondNodeId] = childNodeIds;

        const nephewId = yield* Given.INSERT_NODE_WITH_TEXT({
          parentId: secondNodeId,
          insert: "after",
          text: "Nephew",
        });

        const firstBlockId = Id.makeFrameBlockId(frameId, firstNodeId);

        render(() => <FrameView frameId={frameId} />);

        yield* Given.BLOCK_IS_FOCUSED_AT(firstBlockId, 5);
        yield* When.USER_PRESSES("{Delete}");

        yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
        yield* Then.NODE_HAS_TEXT(firstNodeId, "First");
        yield* Then.NODE_HAS_TEXT(secondNodeId, "Second");
        yield* Then.NODE_HAS_CHILDREN(secondNodeId, 1);
        yield* Then.NODE_HAS_TEXT(nephewId, "Nephew");
        yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Enter", () => {
    describe("block", () => {
      it("splits text when Enter pressed in middle of text", async () => {
        await Effect.gen(function* () {
          const { frameId, rootNodeId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First child" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 5);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(2);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

          const Node = yield* NodeT;
          const children = yield* Node.getNodeChildren(rootNodeId);
          yield* Then.NODE_HAS_TEXT(children[0]!, "First");
          yield* Then.NODE_HAS_TEXT(children[1]!, " child");

          yield* Then.SELECTION_IS_NOT_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("creates new empty sibling when Enter pressed at end of text", async () => {
        await Effect.gen(function* () {
          const { frameId, rootNodeId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First child" },
            ]);

          const firstChildBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 11);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(2);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
          yield* Then.SELECTION_IS_NOT_ON_BLOCK(firstChildBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("creates new empty sibling above when Enter pressed at start of non-empty text", async () => {
        await Effect.gen(function* () {
          const { frameId, rootNodeId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [
              { text: "First child" },
            ]);

          const originalBlockId = Id.makeFrameBlockId(
            frameId,
            childNodeIds[0],
          );

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(originalBlockId, 0);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(2);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

          yield* Then.NODE_HAS_TEXT(childNodeIds[0], "First child");

          const Node = yield* NodeT;
          const children = yield* Node.getNodeChildren(rootNodeId);
          yield* Then.NODE_HAS_TEXT(children[0]!, "");
          yield* Then.NODE_HAS_TEXT(children[1]!, "First child");

          yield* Then.SELECTION_IS_NOT_ON_BLOCK(originalBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("creates new empty sibling below when Enter pressed in empty block", async () => {
        await Effect.gen(function* () {
          const { frameId, rootNodeId, childNodeIds } =
            yield* Given.A_FRAME_WITH_CHILDREN("Root node", [{ text: "" }]);

          const emptyBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

          render(() => <FrameView frameId={frameId} />);

          yield* Given.BLOCK_IS_FOCUSED_AT(emptyBlockId, 0);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(2);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

          yield* Then.NODE_HAS_TEXT(childNodeIds[0], "");

          const Node = yield* NodeT;
          const children = yield* Node.getNodeChildren(rootNodeId);
          yield* Then.NODE_HAS_TEXT(children[0]!, "");
          yield* Then.NODE_HAS_TEXT(children[1]!, "");

          yield* Then.SELECTION_IS_NOT_ON_BLOCK(emptyBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });
    });

    describe("title", () => {
      it("creates first child block when Enter pressed at end of title", async () => {
        await Effect.gen(function* () {
          const { frameId, nodeId: rootNodeId } =
            yield* Given.A_FRAME_WITH_TEXT("Document Title");

          render(() => <FrameView frameId={frameId} />);

          yield* When.USER_CLICKS_TITLE(frameId);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(1);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

          yield* Then.NODE_HAS_TEXT(rootNodeId, "Document Title");
          const Node = yield* NodeT;
          const children = yield* Node.getNodeChildren(rootNodeId);
          expect(children.length).toBe(1);
          yield* Then.NODE_HAS_TEXT(children[0]!, "");

          const newBlockId = Id.makeFrameBlockId(frameId, children[0]!);
          yield* Then.SELECTION_IS_ON_BLOCK(newBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("moves all content to first block when Enter pressed at start of title", async () => {
        await Effect.gen(function* () {
          const { frameId, nodeId: rootNodeId } =
            yield* Given.A_FRAME_WITH_TEXT("Document Title");

          render(() => <FrameView frameId={frameId} />);

          yield* Given.TITLE_IS_FOCUSED_AT(frameId, rootNodeId, 0);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(1);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

          yield* Then.NODE_HAS_TEXT(rootNodeId, "");
          const Node = yield* NodeT;
          const children = yield* Node.getNodeChildren(rootNodeId);
          yield* Then.NODE_HAS_TEXT(children[0]!, "Document Title");

          const newBlockId = Id.makeFrameBlockId(frameId, children[0]!);
          yield* Then.SELECTION_IS_ON_BLOCK(newBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });

      it("splits title text when Enter pressed in middle", async () => {
        await Effect.gen(function* () {
          const { frameId, nodeId: rootNodeId } =
            yield* Given.A_FRAME_WITH_TEXT("Document Title");

          render(() => <FrameView frameId={frameId} />);

          yield* Given.TITLE_IS_FOCUSED_AT(frameId, rootNodeId, 8);
          yield* When.USER_PRESSES("{Enter}");

          yield* Then.BLOCK_COUNT_IS(1);
          yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

          yield* Then.NODE_HAS_TEXT(rootNodeId, "Document");
          const Node = yield* NodeT;
          const children = yield* Node.getNodeChildren(rootNodeId);
          yield* Then.NODE_HAS_TEXT(children[0]!, " Title");

          const newBlockId = Id.makeFrameBlockId(frameId, children[0]!);
          yield* Then.SELECTION_IS_ON_BLOCK(newBlockId);
          yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
        }).pipe(runtime.runPromise);
      });
    });
  });
});
