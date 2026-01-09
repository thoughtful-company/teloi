import "@/index.css";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { NavigationT } from "@/services/ui/Navigation";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { waitFor } from "solid-testing-library";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Mod+. key", () => {
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

  it("zooms into focused block when Mod+. pressed", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      const Store = yield* StoreT;
      const bufferDoc = yield* Store.getDocument("buffer", bufferId);
      const buffer = Option.getOrThrow(bufferDoc);
      expect(buffer.assignedNodeId).toBe(childNodeIds[0]);

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
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      expect(window.location.pathname).toBe(`/workspace/${childNodeIds[0]}`);
    }).pipe(runtime.runPromise);
  });

  it("preserves cursor position in title when zooming into block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "Hello world" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 5);

      yield* Effect.sleep("50 millis");

      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);

      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Hello world");
          },
          { timeout: 2000 },
        ),
      );

      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("restores selection to block when navigating back after zoom", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Root node", [
          { text: "Hello world" },
        ]);

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      history.replaceState({}, "", `/workspace/${rootNodeId}`);

      const Navigation = yield* NavigationT;
      const popstateStream = yield* Navigation.startPopstateListener();
      runtime.runFork(Stream.runDrain(popstateStream));

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(blockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[0], 5);

      yield* Effect.sleep("50 millis");

      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);

      yield* When.USER_PRESSES("{Meta>}.{/Meta}");

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Hello world");
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.sync(() => history.back());

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const title = document.querySelector("[data-element-type='title']");
            expect(title?.textContent).toBe("Root node");
          },
          { timeout: 2000 },
        ),
      );

      yield* Effect.promise(() =>
        waitFor(
          () => {
            const block = document.querySelector(
              `[data-element-id="${blockId}"]`,
            );
            const editor = block?.querySelector(".cm-editor");
            expect(editor).not.toBeNull();
          },
          { timeout: 2000 },
        ),
      );

      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });
});
