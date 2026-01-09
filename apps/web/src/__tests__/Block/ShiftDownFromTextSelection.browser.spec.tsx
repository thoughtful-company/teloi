import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
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
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      yield* When.USER_CLICKS_BLOCK(blockId);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* Given.BUFFER_HAS_SELECTION(
        bufferId,
        { nodeId: childNodeIds[0], offset: 5 },
        { nodeId: childNodeIds[0], offset: 11 },
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(5);
            expect(buf.selection?.focusOffset).toBe(11);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });

  it("does NOT enter block selection mode when focus offset is not at document length", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      yield* When.USER_CLICKS_BLOCK(blockId);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* Given.BUFFER_HAS_SELECTION(
        bufferId,
        { nodeId: childNodeIds[0], offset: 11 },
        { nodeId: childNodeIds[0], offset: 5 },
      );

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(11);
            expect(buf.selection?.focusOffset).toBe(5);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selectedBlocks).toEqual([]);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("enters block selection from collapsed cursor at document length", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      const Store = yield* StoreT;

      yield* When.USER_CLICKS_BLOCK(blockId);

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cmEditor = document.querySelector(".cm-editor.cm-focused");
            expect(cmEditor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* Given.BUFFER_HAS_CURSOR(bufferId, childNodeIds[0], 11);

      yield* Effect.promise(() =>
        waitFor(
          async () => {
            const bufferDoc = await Store.getDocument("buffer", bufferId).pipe(
              runtime.runPromise,
            );
            expect(Option.isSome(bufferDoc)).toBe(true);
            const buf = Option.getOrThrow(bufferDoc);
            expect(buf.selection?.anchorOffset).toBe(11);
            expect(buf.selection?.focusOffset).toBe(11);
          },
          { timeout: 2000 },
        ),
      );

      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]], {
        anchor: childNodeIds[0],
        focus: childNodeIds[0],
      });
    }).pipe(runtime.runPromise);
  });
});
