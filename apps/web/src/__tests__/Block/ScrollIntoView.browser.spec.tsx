import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block selection scroll into view", () => {
  let scrollTopSetter: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ArrowDown scrolls when block is near bottom edge", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "First block" }, { text: "Second block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      // Render with scroll container wrapper
      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Find the scroll container we created
      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      // Spy on scrollTop setter
      let currentScrollTop = 0;
      scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      // Mock getBoundingClientRect for container and block
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

      // Mock the second block as being near the bottom edge of container
      const secondBlockEl = document.querySelector(
        `[data-element-id="${secondBlockId}"]`,
      );
      vi.spyOn(
        secondBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 450, // 50px from bottom of 500px container (within 100px margin)
        bottom: 480,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 450,
        toJSON: () => ({}),
      });

      // When: User presses ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Second block is selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      // Wait for animation to complete (150ms + buffer)
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      // And: scrollTop was set (scrolling happened)
      expect(scrollTopSetter).toHaveBeenCalled();
      // Final value should be positive (scrolled down)
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

      // Render with scroll container wrapper
      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      yield* When.USER_ENTERS_BLOCK_SELECTION(secondBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      // Find the scroll container we created
      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      // Start with some scroll position so we can scroll up
      let currentScrollTop = 200;
      scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      // Mock getBoundingClientRect for container
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

      // Mock the first block as being near the top edge
      const firstBlockEl = document.querySelector(
        `[data-element-id="${firstBlockId}"]`,
      );
      vi.spyOn(
        firstBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 30, // 30px from top, below the 50px margin threshold
        bottom: 60,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 50,
        toJSON: () => ({}),
      });

      // When: User presses ArrowUp
      yield* When.USER_PRESSES("{ArrowUp}");

      // Then: First block is selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Wait for animation to complete (150ms + buffer)
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      // And: scrollTop was set (scrolling happened)
      expect(scrollTopSetter).toHaveBeenCalled();
      // Final value should be less than initial (scrolled up)
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

      // Render with scroll container wrapper
      render(() => (
        <div class="overflow-y-auto" style={{ height: "500px" }}>
          <EditorBuffer bufferId={bufferId} />
        </div>
      ));

      yield* When.USER_ENTERS_BLOCK_SELECTION(firstBlockId);
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[0]]);

      // Find the scroll container we created
      const scrollContainer =
        document.querySelector<HTMLElement>(".overflow-y-auto");
      if (!scrollContainer) throw new Error("Scroll container not found");

      // Spy on scrollTop setter
      let currentScrollTop = 0;
      scrollTopSetter = vi.fn((value: number) => {
        currentScrollTop = value;
      });
      Object.defineProperty(scrollContainer, "scrollTop", {
        get: () => currentScrollTop,
        set: scrollTopSetter,
        configurable: true,
      });

      // Mock getBoundingClientRect for container
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

      // Mock the second block as being comfortably in the middle
      const secondBlockEl = document.querySelector(
        `[data-element-id="${secondBlockId}"]`,
      );
      vi.spyOn(
        secondBlockEl as Element,
        "getBoundingClientRect",
      ).mockReturnValue({
        top: 200, // Well within container (100px margin on each side)
        bottom: 230,
        left: 0,
        right: 100,
        width: 100,
        height: 30,
        x: 0,
        y: 200,
        toJSON: () => ({}),
      });

      // When: User presses ArrowDown
      yield* When.USER_PRESSES("{ArrowDown}");

      // Then: Second block is selected
      yield* Then.BLOCKS_ARE_SELECTED(bufferId, [childNodeIds[1]]);

      // Wait for potential animation
      yield* Effect.promise(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      // And: scrollTop was NOT modified
      expect(scrollTopSetter).not.toHaveBeenCalled();
    }).pipe(runtime.runPromise);
  });
});
