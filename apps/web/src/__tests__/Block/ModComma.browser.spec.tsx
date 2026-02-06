import "@/index.css";
import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import { NavigationT } from "@/services/ui/Navigation";
import { SCROLL_MARGIN } from "@/utils/scroll";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Block Mod+, key (ZoomOut)", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
    history.replaceState({}, "", "/");
  });

  afterEach(async () => {
    await cleanup();
  });

  it("zooms out from nested block when Mod+, pressed", async () => {
    await Effect.gen(function* () {
      // Create hierarchy: parentNode > rootNode (frame root) > children
      // First zoom into a child, then Mod+, should return to rootNode
      const { frameId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const firstChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // Zoom into the first child using Mod+.
      yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Verify we zoomed in - frame should now show "First child" as title
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("First child");
          },
          { timeout: 2000 },
        ),
      );

      // Now zoom out using Mod+,
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      // Should return to the original root node
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Root node");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("updates URL to parent nodeId when Mod+, pressed", async () => {
    await Effect.gen(function* () {
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      render(() => <FrameView frameId={frameId} />);

      // First zoom into the child
      yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Verify URL changed to child
      expect(window.location.pathname).toBe(`/workspace/${childNodeIds[0]}`);

      // Now zoom out
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      // URL should change back to root
      yield* Effect.promise(() =>
        waitFor(
          () => {
            expect(window.location.pathname).toBe(`/workspace/${rootNodeId}`);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("does nothing at root level", async () => {
    await Effect.gen(function* () {
      // Use a hierarchy where the frame root has NO parent
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeFrameBlockId(frameId, childNodeIds[0]);

      // Set initial URL
      history.replaceState({}, "", `/workspace/${rootNodeId}`);

      render(() => <FrameView frameId={frameId} />);

      // Click on the child block to have focus somewhere
      yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);

      // Try to zoom out - should be a no-op since rootNode has no parent
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      // URL should remain unchanged
      expect(window.location.pathname).toBe(`/workspace/${rootNodeId}`);

      // Title should still be "Root node"
      const title = document.querySelector("[data-element-type='title']");
      expect(title?.textContent).toBe("Root node");
    }).pipe(runtime.runPromise);
  });

  it("zooms out from title editor", async () => {
    await Effect.gen(function* () {
      // Create hierarchy with parent so we can zoom out
      const { frameId, parentNodeId, rootNodeId } =
        yield* Given.A_FRAME_WITH_PARENT_AND_CHILDREN(
          "Parent node",
          "Root node",
          [{ text: "First child" }],
        );

      // Set URL to root node (which has a parent)
      history.replaceState({}, "", `/workspace/${rootNodeId}`);

      render(() => <FrameView frameId={frameId} />);

      // Click on title to focus it
      yield* When.USER_CLICKS_TITLE(frameId);

      // Zoom out from title
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      // Should navigate to parent
      yield* Effect.promise(() =>
        waitFor(
          () => {
            expect(window.location.pathname).toBe(`/workspace/${parentNodeId}`);
          },
          { timeout: 2000 },
        ),
      );

      // Title should now show "Parent node"
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Parent node");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("selects collapsed ancestor when zooming out from invisible child", async () => {
    await Effect.gen(function* () {
      // Given: Root > First child (collapsed) > Grandchild
      // When zooming out from Grandchild view, and First child is collapsed in Root view,
      // selection should fall back to First child (the visible ancestor), not Grandchild.
      const { frameId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root", [
          { text: "First child" },
        ]);

      const firstChildNodeId = childNodeIds[0];
      const firstChildBlockId = Id.makeFrameBlockId(frameId, firstChildNodeId);

      // Add grandchild under "First child"
      const grandchildNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: firstChildNodeId,
        insert: "after",
        text: "Grandchild",
      });
      const grandchildBlockId = Id.makeFrameBlockId(frameId, grandchildNodeId);

      render(() => <FrameView frameId={frameId} />);

      // Collapse "First child" block (hides grandchild in Root view)
      const Block = yield* BlockT;
      yield* Block.setExpanded(firstChildBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(firstChildBlockId);

      // Zoom into "First child" via Cmd+.
      yield* Given.BLOCK_IS_FOCUSED_AT(firstChildBlockId, 0);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Verify we zoomed in - frame should now show "First child" as title
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("First child");
          },
          { timeout: 2000 },
        ),
      );

      // Now in "First child" view, the grandchild is visible (block is expanded in its own view)
      // Click on the grandchild block
      yield* Given.BLOCK_IS_FOCUSED_AT(grandchildBlockId, 0);

      // Zoom out using Cmd+,
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      // Should return to Root view
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Root");
          },
          { timeout: 2000 },
        ),
      );

      // Selection should be on "First child" (the collapsed parent), NOT grandchild
      // because grandchild is not visible when First child is collapsed
      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);
    }).pipe(runtime.runPromise);
  });

  it("scrolls cursor into view after each Mod+, zoom out", async () => {
    await Effect.gen(function* () {
      // Create deep hierarchy:
      // Grandparent
      //   - Root (with 20 children to make it scrollable)
      //     - Block 1-20 (siblings)
      //     - Block 21 (child of Block 20)
      //       - Block 22 (cursor starts here)

      // Create root with 20 children
      const children = Array.from({ length: 20 }, (_, i) => ({
        text: `Block ${i + 1}`,
      }));
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_PARENT_AND_CHILDREN(
          "Grandparent",
          "Root",
          children,
        );

      const block20Id = childNodeIds[19]!;

      // Add Block 21 as child of Block 20
      const block21Id = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: block20Id,
        insert: "after",
        text: "Block 21",
      });

      // Add Block 22 as child of Block 21
      const block22Id = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: block21Id,
        insert: "after",
        text: "Block 22",
      });

      // Start at Block 22's view (zoom into it)
      history.replaceState({}, "", `/workspace/${block22Id}`);

      // Sync URL to frame model
      const Navigation = yield* NavigationT;
      yield* Navigation.syncUrlToModel();

      // Wrap in scroll container with limited height
      render(() => (
        <div class="overflow-y-auto" style={{ height: "300px" }}>
          <FrameView frameId={frameId} />
        </div>
      ));

      // Wait for initial render
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Block 22");
          },
          { timeout: 2000 },
        ),
      );

      // Focus the title to enable keyboard shortcuts
      yield* When.USER_CLICKS_TITLE(frameId);

      // Helper to check if element is visible in scroll container
      const isBlockVisibleInContainer = (blockId: Id.Block): boolean => {
        const blockEl = document.querySelector(
          `[data-element-id="${blockId}"]`,
        );
        if (!blockEl) return false;

        const scrollContainer = blockEl.closest(".overflow-y-auto");
        if (!scrollContainer) return false;

        const containerRect = scrollContainer.getBoundingClientRect();
        const blockRect = blockEl.getBoundingClientRect();

        // Check if block is within container bounds (with some tolerance for margin)
        return (
          blockRect.top >= containerRect.top - SCROLL_MARGIN - 50 &&
          blockRect.bottom <= containerRect.bottom + SCROLL_MARGIN + 50
        );
      };

      // Press Mod+, #1: Block 22 view → Block 21 view (cursor on Block 22)
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Block 21");
          },
          { timeout: 2000 },
        ),
      );

      const block22BlockId = Id.makeFrameBlockId(frameId, block22Id);
      yield* Effect.promise(() =>
        waitFor(
          () => {
            expect(
              isBlockVisibleInContainer(block22BlockId),
              "Block 22 should be visible after 1st Mod+,",
            ).toBe(true);
          },
          { timeout: 2000 },
        ),
      );

      // Press Mod+, #2: Block 21 view → Block 20 view (cursor on Block 21)
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Block 20");
          },
          { timeout: 2000 },
        ),
      );

      const block21BlockId = Id.makeFrameBlockId(frameId, block21Id);
      yield* Effect.promise(() =>
        waitFor(
          () => {
            expect(
              isBlockVisibleInContainer(block21BlockId),
              "Block 21 should be visible after 2nd Mod+,",
            ).toBe(true);
          },
          { timeout: 2000 },
        ),
      );

      // Press Mod+, #3: Block 20 view → Root view (cursor on Block 20)
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Root");
          },
          { timeout: 2000 },
        ),
      );

      const block20BlockId = Id.makeFrameBlockId(frameId, block20Id);
      yield* Effect.promise(() =>
        waitFor(
          () => {
            expect(
              isBlockVisibleInContainer(block20BlockId),
              "Block 20 should be visible after 3rd Mod+,",
            ).toBe(true);
          },
          { timeout: 2000 },
        ),
      );

      // Press Mod+, #4: Root view → Grandparent view
      // Note: Cursor stays on Block 22 (deeply nested) because blocks are expanded by default
      yield* When.USER_PRESSES("{Meta>},{/Meta}");

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Grandparent");
          },
          { timeout: 2000 },
        ),
      );

      // Block 22 is deeply nested: Grandparent > Root > Block 20 > Block 21 > Block 22
      // The scroll should bring Block 22 (and its ancestors) into view
      yield* Effect.promise(() =>
        waitFor(
          () => {
            expect(
              isBlockVisibleInContainer(block22BlockId),
              "Block 22 should be visible after 4th Mod+,",
            ).toBe(true);
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });
});
