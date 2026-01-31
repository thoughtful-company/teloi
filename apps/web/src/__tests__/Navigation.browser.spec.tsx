import "@/index.css";
import { Id, System } from "@/schema";
import { NavigationT } from "@/services/ui/Navigation";
import { StoreT } from "@/services/external/Store";
import BufferView from "@/ui/BufferView";
import { Effect, Option, Stream } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Navigation", () => {
  let runtime: BrowserRuntime;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Reset URL to root before each test
    history.replaceState({}, "", "/");
    const setup = await setupClientTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("syncUrlToModel", () => {
    it("sets buffer assignedNodeId from valid nodeId in URL", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy (window → pane → buffer → node)
        const { bufferId, nodeId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");

        // And: URL contains that nodeId
        history.replaceState({}, "", `/workspace/${nodeId}`);

        // When: syncUrlToModel runs
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel();

        // Then: Buffer's assignedNodeId matches the URL
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(nodeId);
      }).pipe(runtime.runPromise);
    });

    it("sets buffer assignedNodeId to null for invalid nodeId in URL", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");

        // And: URL contains a non-existent nodeId
        history.replaceState({}, "", "/workspace/non-existent-node-id");

        // When: syncUrlToModel runs (no fallback provided)
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel();

        // Then: Buffer's assignedNodeId is null (node doesn't exist)
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBeNull();
      }).pipe(runtime.runPromise);
    });

    it("uses System.WORKSPACE when URL is empty", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");

        // And: URL is just root (no nodeId)
        history.replaceState({}, "", "/");

        // When: syncUrlToModel runs
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel();

        // Then: Buffer's assignedNodeId is set to workspace home
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(System.WORKSPACE);
      }).pipe(runtime.runPromise);
    });

    it("uses System.WORKSPACE when URL has /workspace/ but no nodeId", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");

        // And: URL is /workspace/ without a nodeId
        history.replaceState({}, "", "/workspace/");

        // When: syncUrlToModel runs
        const Navigation = yield* NavigationT;
        yield* Navigation.syncUrlToModel();

        // Then: Buffer's assignedNodeId is set to workspace home
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(System.WORKSPACE);
      }).pipe(runtime.runPromise);
    });
  });

  describe("navigateTo", () => {
    it("updates buffer assignedNodeId and URL", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId, nodeId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");

        // And: Initial URL is root
        history.replaceState({}, "", "/");

        // When: navigateTo is called with the nodeId
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(nodeId);

        // Then: Buffer's assignedNodeId is updated
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBe(nodeId);

        // And: URL is updated
        expect(window.location.pathname).toBe(`/workspace/${nodeId}`);
      }).pipe(runtime.runPromise);
    });

    it("navigateTo(null) clears buffer and sets URL to /workspace", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy with node assigned via navigateTo
        const { bufferId, nodeId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(nodeId);

        // When: navigateTo is called with null
        yield* Navigation.navigateTo(null);

        // Then: Buffer's assignedNodeId is null
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBeNull();

        // And: URL is /workspace
        expect(window.location.pathname).toBe("/workspace");
      }).pipe(runtime.runPromise);
    });

    it("navigateTo with invalid nodeId sets assignedNodeId to null", async () => {
      await Effect.gen(function* () {
        // Given: A full hierarchy
        const { bufferId } =
          yield* Given.A_FULL_HIERARCHY_WITH_TEXT("Test content");

        // When: navigateTo is called with a non-existent nodeId
        const Navigation = yield* NavigationT;
        const fakeNodeId = Id.Node.make("non-existent-node");
        yield* Navigation.navigateTo(fakeNodeId);

        // Then: Buffer's assignedNodeId is null (node doesn't exist)
        const Store = yield* StoreT;
        const bufferDoc = yield* Store.getDocument("buffer", bufferId);
        const buffer = Option.getOrThrow(bufferDoc);
        expect(buffer.assignedNodeId).toBeNull();
      }).pipe(runtime.runPromise);
    });
  });
});

describe("Navigation with UI", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    history.replaceState({}, "", "/");
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("scroll into view after browser back", () => {
    it("scrolls focused block into view after popstate navigation", async () => {
      await Effect.gen(function* () {
        // Given: A page with many blocks (enough to scroll)
        const children = Array.from({ length: 20 }, (_, i) => ({
          text: `Block ${i + 1} content`,
        }));
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root page", children);

        // Set URL to the root page
        history.replaceState({}, "", `/workspace/${rootNodeId}`);

        // Start popstate listener
        const Navigation = yield* NavigationT;
        const popstateStream = yield* Navigation.startPopstateListener();
        runtime.runFork(Stream.runDrain(popstateStream));

        // Wrap in scroll container (simulates PaneWrapper) with limited height to force scrolling
        render(() => (
          <div class="overflow-y-auto" style={{ height: "300px" }}>
            <BufferView bufferId={bufferId} />
          </div>
        ));

        // Wait for content to render
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blocks = document.querySelectorAll(
                "[data-element-type='block']",
              );
              if (blocks.length < 20)
                throw new Error("Not all blocks rendered");
            },
            { timeout: 3000 },
          ),
        );

        // Get the last child block (index 19 = 20th element)
        const lastChildId = childNodeIds[19]!;
        const lastBlockId = Id.makeBufferBlockId(bufferId, lastChildId);

        // Click on the last block (this should scroll it into view initially)
        yield* Given.BLOCK_IS_FOCUSED_AT(lastBlockId, 0);

        // Set cursor position in this block
        yield* Given.BUFFER_HAS_CURSOR(bufferId, lastChildId, 3);

        // Zoom into this block (navigate to it)
        yield* When.USER_PRESSES("{Meta>}.{/Meta}");

        // Wait for the zoom to complete (title should show block content)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const title = document.querySelector(
                "[data-element-type='title']",
              );
              expect(title?.textContent).toBe(`Block 20 content`);
            },
            { timeout: 2000 },
          ),
        );

        // Navigate back using browser history
        yield* Effect.sync(() => history.back());

        // Wait for the root page to be restored
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const title = document.querySelector(
                "[data-element-type='title']",
              );
              expect(title?.textContent).toBe("Root page");
            },
            { timeout: 2000 },
          ),
        );

        // Wait for the block's editor to be mounted (selection restored)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${lastBlockId}"]`,
              );
              const editor = block?.querySelector(".cm-editor");
              if (!editor) throw new Error("CodeMirror not mounted in block");
            },
            { timeout: 2000 },
          ),
        );

        // Then: The block should scroll into view
        // Wait for the spring animation to complete (uses waitFor to poll)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const blockEl = document.querySelector(
                `[data-element-id="${lastBlockId}"]`,
              );
              expect(blockEl).not.toBeNull();

              const scrollContainer = blockEl!.closest(".overflow-y-auto");
              expect(scrollContainer).not.toBeNull();

              const containerRect = scrollContainer!.getBoundingClientRect();
              const blockRect = blockEl!.getBoundingClientRect();

              // Block should be visible within the scroll container
              // (accounting for scroll margin, the block should be within container bounds)
              const isBlockVisible =
                blockRect.top >= containerRect.top - 100 &&
                blockRect.bottom <= containerRect.bottom + 100;

              expect(
                isBlockVisible,
                `Block should be visible in viewport. Block top: ${blockRect.top}, Container top: ${containerRect.top}, Container bottom: ${containerRect.bottom}`,
              ).toBe(true);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
