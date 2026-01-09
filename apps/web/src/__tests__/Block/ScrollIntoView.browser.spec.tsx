import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block selection scroll into view", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;
  let scrollTopSetter: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it("ArrowDown scrolls when block is near bottom edge", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      let currentScrollTop = 0;
      scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      const containerRect = {
        top: 0,
        bottom: 500,
        left: 0,
        right: 800,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue(
        containerRect,
      );

      const secondBlockEl = document.querySelector(
        `[data-element-id="${secondBlockId}"]`,
      );
      vi.spyOn(
        secondBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 450,
        bottom: 480,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 450,
        toJSON: () => ({}),
      });

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      expect(scrollTopSetter).toHaveBeenCalled();
      expect(currentScrollTop).toBeGreaterThan(0);
    }).pipe(runtime.runPromise);
  });

  it("ArrowUp scrolls when block is near top edge", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      let currentScrollTop = 200;
      scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      const containerRect = {
        top: 0,
        bottom: 500,
        left: 0,
        right: 800,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue(
        containerRect,
      );

      const firstBlockEl = document.querySelector(
        `[data-element-id="${firstBlockId}"]`,
      );
      vi.spyOn(
        firstBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 30,
        bottom: 60,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 50,
        toJSON: () => ({}),
      });

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      expect(scrollTopSetter).toHaveBeenCalled();
      expect(currentScrollTop).toBeLessThan(200);
    }).pipe(runtime.runPromise);
  });

  it("does not scroll when block is comfortably visible", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      let currentScrollTop = 0;
      scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      const containerRect = {
        top: 0,
        bottom: 500,
        left: 0,
        right: 800,
        width: 800,
        height: 500,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      };
      vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue(
        containerRect,
      );

      const secondBlockEl = document.querySelector(
        `[data-element-id="${secondBlockId}"]`,
      );
      vi.spyOn(
        secondBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 200,
        bottom: 230,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 200,
        toJSON: () => ({}),
      });

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      expect(scrollTopSetter).not.toHaveBeenCalled();
    }).pipe(runtime.runPromise);
  });
});
