import "@/index.css";
import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { AutomergeT } from "@/services/external/Automerge";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import BufferView from "@/ui/BufferView";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  setupClientTest,
  type BrowserRuntime,
  When,
} from "@/test-utils/bdd";

/**
 * Property Trigger Tests
 *
 * When user types "> " (greater-than followed by space) at the START of a block:
 * 1. Create a property linked to the page's view
 * 2. Delete the triggering block
 *
 * This is a UI-level trigger that invokes service layer operations.
 */

describe("Property Creation Trigger", () => {
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

  describe("typing '> ' at block start creates a property", () => {
    it("creates a property linked to the page's view", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;

        // Setup: buffer with a child node (the trigger target)
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Page Title", [{ text: "" }]);
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block to focus it
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "> " (the trigger sequence)
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Wait for the property to be created
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const viewId = await View.getOrCreateView(rootNodeId).pipe(
                runtime.runPromise,
              );
              const properties = await Property.getPropertiesForView(
                viewId,
              ).pipe(runtime.runPromise);
              expect(properties.length).toBeGreaterThan(0);
            },
            { timeout: 2000 },
          ),
        );

        // Verify: property is linked to the page's view via HAS_PROPERTY tuple
        const viewId = yield* View.getOrCreateView(rootNodeId);
        const properties = yield* Property.getPropertiesForView(viewId);
        expect(properties).toHaveLength(1);
      }).pipe(runtime.runPromise);
    });

    it("deletes the triggering block after property creation", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;

        // Setup: buffer with a child node (the trigger target)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Page Title",
          [{ text: "" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Verify node exists before trigger
        const nodeBefore = yield* Store.query(
          queryDb(tables.nodes.select().where({ id: childNodeId }).first()),
        );
        expect(nodeBefore).toBeDefined();

        // Click the block to focus it
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "> " (the trigger sequence)
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Wait for the node to be deleted
        // Query all nodes and check the deleted one isn't in the list
        // (querying for a deleted node directly throws an error)
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const allNodes = await Effect.gen(function* () {
                const Store = yield* StoreT;
                return yield* Store.query(queryDb(tables.nodes.select()));
              }).pipe(runtime.runPromise);
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

    it("created property has empty name initially", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;

        // Setup: buffer with a child node (the trigger target)
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Page Title", [{ text: "" }]);
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block to focus it
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "> " (the trigger sequence)
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Wait for property to be created and verify it has empty title
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const viewId = await View.getOrCreateView(rootNodeId).pipe(
                runtime.runPromise,
              );
              const properties = await Property.getPropertiesForView(
                viewId,
              ).pipe(runtime.runPromise);
              expect(properties.length).toBeGreaterThan(0);
              expect(properties[0]!.title).toBe("");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("focuses the property name field after creation", async () => {
      await Effect.gen(function* () {
        // Setup: buffer with a child node (the trigger target)
        const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Page Title",
          [{ text: "" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block to focus it
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "> " (the trigger sequence)
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Wait for property section to appear and its name field to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Property section should exist
              const propertySection = document.querySelector(
                '[data-testid="property-section"]',
              );
              expect(propertySection).toBeTruthy();

              // Property name's Editor should have focus
              const focusedEditor = propertySection!.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(
                focusedEditor,
                "Property name Editor should be focused",
              ).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("trigger does NOT fire in invalid contexts", () => {
    it("does NOT trigger when '>' is typed mid-line", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;
        const Automerge = yield* AutomergeT;

        // Setup: buffer with a child node that has existing text
        const { bufferId, rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Page Title", [
            { text: "some text" },
          ]);
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeBufferBlockId(bufferId, childNodeId);

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for block to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const block = document.querySelector(
                `[data-element-id="${childBlockId}"]`,
              );
              expect(block).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the block to focus it (cursor at end by default)
        yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);

        // Type "> " at end of line (mid-line, not at start)
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Small delay to let any potential trigger fire
        yield* Effect.sleep("100 millis");

        // Verify: no property was created
        const viewId = yield* View.getOrCreateView(rootNodeId);
        const properties = yield* Property.getPropertiesForView(viewId);
        expect(properties).toHaveLength(0);

        // Verify: text was inserted literally ("> " appended)
        const text = yield* Automerge.getText(childNodeId);
        expect(text).toBe("some text> ");
      }).pipe(runtime.runPromise);
    });

    it("does NOT trigger in Title (only in blocks)", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;
        const Automerge = yield* AutomergeT;

        // Setup: buffer with root node
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "",
          [{ text: "child" }],
        );

        render(() => <BufferView bufferId={bufferId} />);

        // Wait for title to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const title = document.querySelector(
                `[data-element-type="title"][data-element-id="${bufferId}"]`,
              );
              expect(title).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the title to focus it
        yield* When.USER_CLICKS_TITLE(bufferId);

        // Type "> " in the title
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Small delay to let any potential trigger fire
        yield* Effect.sleep("100 millis");

        // Verify: no property was created
        const viewId = yield* View.getOrCreateView(rootNodeId);
        const properties = yield* Property.getPropertiesForView(viewId);
        expect(properties).toHaveLength(0);

        // Verify: text was inserted literally in title
        const text = yield* Automerge.getText(rootNodeId);
        expect(text).toBe("> ");
      }).pipe(runtime.runPromise);
    });
  });
});
