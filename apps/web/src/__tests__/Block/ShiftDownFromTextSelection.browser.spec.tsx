import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import FrameView from "@/ui/FrameView";
import { Effect, Option } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Shift+Down from in-block text selection", () => {
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

  it("enters block selection mode when focus offset is at document length", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

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

      yield* Given.FRAME_HAS_SELECTION(
        frameId,
        { nodeId: childNodeIds[0], offset: 5 },
        { nodeId: childNodeIds[0], offset: 11 },
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selection?.anchorOffset).toBe(5);
            expect(win.selection?.focusOffset).toBe(11);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Then.BLOCKS_ARE_SELECTED(frameId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });

  it("does NOT enter block selection mode when focus offset is not at document length", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

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

      yield* Given.FRAME_HAS_SELECTION(
        frameId,
        { nodeId: childNodeIds[0], offset: 11 },
        { nodeId: childNodeIds[0], offset: 5 },
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const windowDoc = await Store.getDocument("window", windowId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(windowDoc)).toBe(true);
            const win = Option.getOrThrow(windowDoc);
            expect(win.selection?.anchorOffset).toBe(11);
            expect(win.selection?.focusOffset).toBe(5);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

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
    }).pipe(runtime.runPromise);
  });

  it("enters block selection from collapsed cursor at document length", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds, windowId } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Hello world" }]);

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

      yield* Given.FRAME_HAS_CURSOR(frameId, childNodeIds[0], 11);

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
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Then.BLOCKS_ARE_SELECTED(frameId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });
});
