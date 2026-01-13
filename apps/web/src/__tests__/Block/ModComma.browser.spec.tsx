import "@/index.css";
import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

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
      // Create hierarchy: parentNode > rootNode (buffer root) > children
      // First zoom into a child, then Mod+, should return to rootNode
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Zoom into the first child using Mod+.
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Verify we zoomed in - buffer should now show "First child" as title
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
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // First zoom into the child
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
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
      // Use a hierarchy where the buffer root has NO parent
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      // Set initial URL
      history.replaceState({}, "", `/workspace/${rootNodeId}`);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click on the child block to have focus somewhere
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);

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
      const { bufferId, parentNodeId, rootNodeId } =
        yield* Given.A_BUFFER_WITH_PARENT_AND_CHILDREN("Parent node", "Root node", [
          { text: "First child" },
        ]);

      // Set URL to root node (which has a parent)
      history.replaceState({}, "", `/workspace/${rootNodeId}`);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click on title to focus it
      yield* When.USER_CLICKS_TITLE(bufferId);

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
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root", [
          { text: "First child" },
        ]);

      const firstChildNodeId = childNodeIds[0];
      const firstChildBlockId = Id.makeBlockId(bufferId, firstChildNodeId);

      // Add grandchild under "First child"
      const grandchildNodeId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: firstChildNodeId,
        insert: "after",
        text: "Grandchild",
      });
      const grandchildBlockId = Id.makeBlockId(bufferId, grandchildNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Collapse "First child" block (hides grandchild in Root view)
      const Block = yield* BlockT;
      yield* Block.setExpanded(firstChildBlockId, false);
      yield* Then.BLOCK_IS_COLLAPSED(firstChildBlockId);

      // Zoom into "First child" via Cmd+.
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Verify we zoomed in - buffer should now show "First child" as title
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
      yield* When.USER_CLICKS_BLOCK(grandchildBlockId);

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
});
