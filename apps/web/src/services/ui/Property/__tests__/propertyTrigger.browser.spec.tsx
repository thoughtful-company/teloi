import "@/index.css";
import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import FrameView from "@/ui/FrameView";
import {
  Given,
  setupClientTest,
  type BrowserRuntime,
  When,
} from "@/test-utils/bdd";
import { doubleRaf } from "@/utils/effect";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Property Creation Trigger
 *
 * Typing "> " at the START of an outline block creates a property on the
 * page's default view and deletes the triggering block. The trigger does NOT
 * fire mid-line or inside the title.
 */

describe("Property Creation Trigger", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup) {
      await cleanup();
    }
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  const waitForElement = (selector: string) =>
    Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector(selector);
          expect(el).toBeTruthy();
        },
        { timeout: 2000 },
      ),
    );

  describe("typing '> ' at block start creates a property", () => {
    it("creates an empty-name property on the page's view", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;

        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Page Title", [{ text: "" }]);
        const childBlockId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForElement(`[data-element-id="${childBlockId}"]`);
        yield* Given.KHORA_IS_FOCUSED_AT(childBlockId, 0);

        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const viewId = await View.getOrCreateView(rootNodeId).pipe(
                runtime.runPromise,
              );
              const properties = await Property.getPropertiesForView(
                viewId,
              ).pipe(runtime.runPromise);
              expect(properties).toHaveLength(1);
              expect(properties[0]!.title).toBe("");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("deletes the triggering block", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;

        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Page Title",
          [{ text: "" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeFrameKhoraId(frameId, childNodeId);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForElement(`[data-element-id="${childBlockId}"]`);

        const nodeBefore = yield* Store.query(
          queryDb(tables.nodes.select().where({ id: childNodeId }).first()),
        );
        expect(nodeBefore).toBeDefined();

        yield* Given.KHORA_IS_FOCUSED_AT(childBlockId, 0);
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Querying for a deleted node directly throws, so select all nodes
        // and assert the child id is not present.
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const allNodes = await Store.query(
                queryDb(tables.nodes.select()),
              ).pipe(runtime.runPromise);
              const nodeStillExists = allNodes.some(
                (n) => n.id === childNodeId,
              );
              expect(nodeStillExists).toBe(false);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("focuses the new property title editor after creation", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Page Title",
          [{ text: "" }],
        );
        const childBlockId = Id.makeFrameKhoraId(frameId, childNodeIds[0]);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForElement(`[data-element-id="${childBlockId}"]`);

        yield* Given.KHORA_IS_FOCUSED_AT(childBlockId, 0);
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        yield* waitForElement(".property-name .cm-editor.cm-focused");
      }).pipe(runtime.runPromise);
    });
  });

  describe("trigger does NOT fire in invalid contexts", () => {
    it("does NOT fire when '>' is typed mid-line", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;
        const Automerge = yield* AutomergeT;

        const { frameId, rootNodeId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Page Title", [
            { text: "some text" },
          ]);
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeFrameKhoraId(frameId, childNodeId);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForElement(`[data-element-id="${childBlockId}"]`);
        yield* Given.KHORA_IS_FOCUSED_AT(childBlockId, "some text".length);

        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        yield* doubleRaf;

        const viewId = yield* View.getOrCreateView(rootNodeId);
        const properties = yield* Property.getPropertiesForView(viewId);
        expect(properties).toHaveLength(0);

        const text = yield* Automerge.getText(childNodeId);
        expect(text).toBe("some text> ");
      }).pipe(runtime.runPromise);
    });

    it("does NOT fire in Title", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;
        const Automerge = yield* AutomergeT;

        const { frameId, rootNodeId } = yield* Given.A_FRAME_WITH_CHILDREN("", [
          { text: "child" },
        ]);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForElement(
          `[data-element-type="title"][data-element-id="${frameId}"]`,
        );

        yield* When.USER_CLICKS_TITLE(frameId);

        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        yield* doubleRaf;

        const viewId = yield* View.getOrCreateView(rootNodeId);
        const properties = yield* Property.getPropertiesForView(viewId);
        expect(properties).toHaveLength(0);

        const text = yield* Automerge.getText(rootNodeId);
        expect(text).toBe("> ");
      }).pipe(runtime.runPromise);
    });
  });
});
