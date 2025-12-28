import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { NavigationT } from "@/services/ui/Navigation";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option, Stream } from "effect";
import { describe, it, expect, beforeEach } from "vitest";
import { waitFor } from "solid-testing-library";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block Mod+. key", () => {
  beforeEach(() => {
    history.replaceState({}, "", "/");
  });

  it("zooms into focused block when Mod+. pressed", async () => {
    await Effect.gen(function* () {
      // Given: Full hierarchy with children (required for NavigationT)
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User focuses first child and presses Mod+.
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Then: Buffer's assignedNodeId should be the first child's nodeId
      const Store = yield* StoreT;
      const bufferDoc = yield* Store.getDocument("buffer", bufferId);
      const buffer = Option.getOrThrow(bufferDoc);
      expect(buffer.assignedNodeId).toBe(childNodeIds[0]);

      // And: Title should now show "First child" (the zoomed-in node's text)
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("First child");
          },
          { timeout: 2000 },
        ),
      );
    }).pipe(runtime.runPromise);
  });

  it("updates URL to /workspace/{nodeId} when Mod+. pressed", async () => {
    await Effect.gen(function* () {
      // Given: Full hierarchy with children
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User focuses first child and presses Mod+.
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Then: URL should be updated
      expect(window.location.pathname).toBe(`/workspace/${childNodeIds[0]}`);
    }).pipe(runtime.runPromise);
  });

  it("preserves cursor position in title when zooming into block", async () => {
    // ******* GIVEN THE BUFFER *******
    // Title: Root node
    // ==========
    // ▶ Hello| world    <- cursor at position 5
    //
    // ******* WHEN *******
    // User presses Mod+. to zoom into the block
    //
    // ******* EXPECTED BEHAVIOR *******
    // Title: Hello| world    <- cursor still at position 5
    // ==========
    // (no children visible)
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "Hello world" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus block and set cursor to position 5
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 5);

      // Let selection sync to CodeMirror
      yield* Effect.sleep("50 millis");

      // Verify cursor is at position 5 before zoom
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);

      // Zoom into the block
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Wait for title to appear with zoomed content
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Hello world");
          },
          { timeout: 2000 },
        ),
      );

      // Cursor should still be at position 5 in the title
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("restores selection to block when navigating back after zoom", async () => {
    // ******* GIVEN THE BUFFER *******
    // Title: Root node
    // ==========
    // ▶ Hello| world    <- cursor at position 5
    //
    // ******* WHEN *******
    // 1. User presses Mod+. to zoom into the block
    // 2. User navigates back (browser back button)
    //
    // ******* EXPECTED BEHAVIOR *******
    // Title: Root node
    // ==========
    // ▶ Hello| world    <- cursor back at position 5 on the block
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "Hello world" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      // Set initial URL to root node
      history.replaceState({}, "", `/workspace/${rootNodeId}`);

      // Start the popstate listener (normally done in index.tsx)
      const Navigation = yield* NavigationT;
      const popstateStream = yield* Navigation.startPopstateListener();
      runtime.runFork(Stream.runDrain(popstateStream));

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus block and set cursor to position 5
      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 5);

      // Let selection sync to CodeMirror
      yield* Effect.sleep("50 millis");

      // Verify cursor is at position 5 before zoom
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);

      // Zoom into the block (this pushes a new history entry)
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      // Wait for title to show zoomed content
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Hello world");
          },
          { timeout: 2000 },
        ),
      );

      // Navigate back
      yield* Effect.sync(() => history.back());

      // Wait for popstate to be processed and title to show root content again
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Root node");
          },
          { timeout: 2000 },
        ),
      );

      // Block should be focused again
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const block = document.querySelector(`[data-element-id="${blockId}"]`);
            const editor = block?.querySelector(".cm-editor");
            expect(editor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      // Cursor should be back at position 5
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });
});
