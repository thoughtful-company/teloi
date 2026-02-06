import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
import FrameView from "@/ui/FrameView";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Block Escape key", () => {
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

  it("Escape in text editing mode selects the block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Block content" },
        ]);

      const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

      const Store = yield* StoreT;

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("block");
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Escape}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
            expect((activeEl as { type: "frame"; id: string }).id).toBe(
              frameId,
            );
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(childNodeIds[0]);
            expect(win.blockSelectionAnchor).toBe(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Escape when block selected clears selection but keeps frame active", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Block content" },
        ]);

      const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Escape}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Escape}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([]);
            expect(win.lastFocusedBlockId).toBe(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowLeft from nested block selects parent block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "C",
      });

      const childABlockId = Id.makeFrameBlockId(frameId, childA);

      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* When.USER_ENTERS_BLOCK_SELECTION(childABlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(childA);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{ArrowLeft}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([parentNodeId]);
            expect(win.blockSelectionAnchor).toBe(parentNodeId);
            expect(win.blockSelectionFocus).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowRight from block with children selects first child", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "C",
      });

      const parentBlockId = Id.makeFrameBlockId(frameId, parentNodeId);

      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* When.USER_ENTERS_BLOCK_SELECTION(parentBlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([childA]);
            expect(win.blockSelectionAnchor).toBe(childA);
            expect(win.blockSelectionFocus).toBe(childA);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Escape from top-level block clears selection", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      const blockAId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* When.USER_ENTERS_BLOCK_SELECTION(blockAId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Escape}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Enter after Escape places cursor at end of block, not at old selection position", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

      const blockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockId, 0);

      const Store = yield* StoreT;
      const Frame = yield* FrameT;

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* Frame.setSelection(
        frameId,
        Option.some({
          anchor: { elementId: blockId },
          anchorOffset: 2,
          focus: { elementId: blockId },
          focusOffset: 5,
          goalX: null,
          goalLine: null,
          assoc: 0,
        }),
      );

      yield* When.USER_PRESSES("{Escape}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("frame");
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Enter}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selection?.anchorOffset).toBe(11);
            expect(win.selection?.focusOffset).toBe(11);
            expect(win.activeElement?.type).toBe("block");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});

describe("Block deletion in block selection mode", () => {
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

  it("deleting nested child selects next sibling", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      const childB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "C",
      });

      const childABlockId = Id.makeFrameBlockId(frameId, childA);

      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* When.USER_ENTERS_BLOCK_SELECTION(childABlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(childA);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Delete}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([childB]);
            expect(win.blockSelectionAnchor).toBe(childB);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("deleting last nested child selects parent", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      const onlyChild = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Only child",
      });

      const onlyChildBlockId = Id.makeFrameBlockId(frameId, onlyChild);

      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* When.USER_ENTERS_BLOCK_SELECTION(onlyChildBlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(onlyChild);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Delete}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([parentNodeId]);
            expect(win.blockSelectionAnchor).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("deleting all nested children selects parent", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      const childA = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "A",
      });
      const childB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "B",
      });
      const childC = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "C",
      });

      const childABlockId = Id.makeFrameBlockId(frameId, childA);

      render(() => <FrameView frameId={frameId} />);

      const Store = yield* StoreT;

      yield* When.USER_ENTERS_BLOCK_SELECTION(childABlockId);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toContain(childA);
            expect(win.selectedBlocks).toContain(childB);
            expect(win.selectedBlocks).toContain(childC);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Delete}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedBlocks).toEqual([parentNodeId]);
            expect(win.blockSelectionAnchor).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
