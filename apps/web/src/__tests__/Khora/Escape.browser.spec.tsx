import "@/index.css";
import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import FrameView from "@/ui/FrameView";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  Then,
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
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Block content" },
        ]);

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

            yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const activeEl = Option.getOrThrow(windowDoc).activeElement;
            expect(activeEl?.type).toBe("khora");
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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(childNodeIds[0]);
            expect(win.khoraSelectionAnchor).toBe(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("Escape when block selected clears selection but keeps frame active", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Block content" },
        ]);

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

            yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("ArrowLeft from nested block selects parent block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } =
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

      const childABlockId = Id.makeFrameKhoraId(frameId, childA);

      render(() => <FrameView frameId={frameId} />);

            yield* When.USER_ENTERS_KHORA_SELECTION(childABlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(childA);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{ArrowLeft}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([parentNodeId]);
            expect(win.khoraSelectionAnchor).toBe(parentNodeId);
            expect(win.khoraSelectionFocus).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
      const { frameId, childNodeIds } =
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

      const parentBlockId = Id.makeFrameKhoraId(frameId, parentNodeId);

      render(() => <FrameView frameId={frameId} />);

            yield* When.USER_ENTERS_KHORA_SELECTION(parentBlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([childA]);
            expect(win.khoraSelectionAnchor).toBe(childA);
            expect(win.khoraSelectionFocus).toBe(childA);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      const blockAId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

            yield* When.USER_ENTERS_KHORA_SELECTION(blockAId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(childNodeIds[0]);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Escape}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

      const khoraId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(khoraId, 0);

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
          anchor: { elementId: khoraId },
          anchorOffset: 2,
          focus: { elementId: khoraId },
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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
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
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selection?.anchorOffset).toBe(11);
            expect(win.selection?.focusOffset).toBe(11);
            expect(win.activeElement?.type).toBe("khora");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});

describe("Block deletion in khora selection mode", () => {
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
      const { frameId, childNodeIds } =
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

      const childABlockId = Id.makeFrameKhoraId(frameId, childA);

      render(() => <FrameView frameId={frameId} />);

            yield* When.USER_ENTERS_KHORA_SELECTION(childABlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(childA);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Delete}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([childB]);
            expect(win.khoraSelectionAnchor).toBe(childB);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("deleting last nested child selects parent", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const parentNodeId = childNodeIds[0];

      const onlyChild = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Only child",
      });

      const onlyChildBlockId = Id.makeFrameKhoraId(frameId, onlyChild);

      render(() => <FrameView frameId={frameId} />);

            yield* When.USER_ENTERS_KHORA_SELECTION(onlyChildBlockId);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(onlyChild);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Delete}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([parentNodeId]);
            expect(win.khoraSelectionAnchor).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("deleting all nested children selects parent", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } =
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

      const childABlockId = Id.makeFrameKhoraId(frameId, childA);

      render(() => <FrameView frameId={frameId} />);

            yield* When.USER_ENTERS_KHORA_SELECTION(childABlockId);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toContain(childA);
            expect(win.selectedKhoras).toContain(childB);
            expect(win.selectedKhoras).toContain(childC);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Delete}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Then.WINDOW_DOC_COMPAT(frameId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selectedKhoras).toEqual([parentNodeId]);
            expect(win.khoraSelectionAnchor).toBe(parentNodeId);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
