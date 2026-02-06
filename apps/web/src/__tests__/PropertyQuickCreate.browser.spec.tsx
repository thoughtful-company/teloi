import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { AutomergeT } from "@/services/external/Automerge";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import FrameView from "@/ui/FrameView";
import PropertySection from "@/ui/PropertySection";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  setupClientTest,
  When,
  type BrowserRuntime,
} from "@/test-utils/bdd";

/**
 * Property Quick-Create Tests
 *
 * When user presses Arrow Right at the END of an unbound property name, it should:
 * 1. Create a Tuple Type named "{propertyName}_Tuple"
 * 2. Create two position nodes as shadow children: position 0 = property name, position 1 = "Is {name} For"
 * 3. Bind property to tuple type (hostPosition: 1, displayPosition: 0)
 * 4. Show ghost block (NOT create a linked block yet)
 * 5. Focus the ghost block
 *
 * The first linked block is created when user types in the ghost block (ghost materialization).
 *
 * Tests render PropertySection directly since Frame integration is a separate concern.
 */

describe("Property Quick-Create", () => {
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

  /**
   * Helper to create a property with the given name for a page.
   * Returns the property ID and related IDs.
   */
  const createUnboundProperty = (propertyName: string) =>
    Effect.gen(function* () {
      const Property = yield* PropertyT;
      const View = yield* ViewT;
      const Automerge = yield* AutomergeT;

      // Create a page with a child node
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Test Page", [
          { text: "some content" },
        ]);

      // Create view and property for the page
      const viewId = yield* View.getOrCreateView(rootNodeId);
      const propertyId = yield* Property.createProperty(viewId);

      // Set property name via Automerge
      yield* Automerge.setText(propertyId, propertyName);

      return {
        frameId,
        rootNodeId,
        childNodeIds,
        viewId,
        propertyId,
        propertyName,
      };
    });

  /** Helper to wait for property name element and click it */
  const clickPropertyName = () =>
    Effect.gen(function* () {
      const el = yield* Effect.promise(() =>
        waitFor(
          () => {
            const propNameEl = document.querySelector(".property-name");
            expect(propNameEl).toBeTruthy();
            return propNameEl as HTMLElement;
          },
          { timeout: 2000 },
        ),
      );
      el.click();
    });

  describe("Arrow Right at end of unbound property creates tuple type", () => {
    it("creates a tuple type named '{propertyName}_Tuple'", async () => {
      await Effect.gen(function* () {
        const { rootNodeId, propertyId, propertyName, frameId } =
          yield* createUnboundProperty("Author");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Wait for property section to appear
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const propertySection = document.querySelector(
                "[data-testid='property-section']",
              );
              expect(propertySection).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Click the property name to focus it (requires editable property name - TBD)
        yield* clickPropertyName();

        // Move cursor to end and press ArrowRight
        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Wait for tuple type to be created
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              // Check for a tuple type node with the expected name pattern
              const tupleType = await Effect.gen(function* () {
                const Store = yield* StoreT;
                const Automerge = yield* AutomergeT;
                const nodes = yield* Store.query(
                  queryDb(tables.nodes.select()),
                );
                // Find the tuple type by checking Automerge text
                for (const node of nodes) {
                  const text = yield* Automerge.getText(node.id as Id.Node);
                  if (text === `${propertyName}_Tuple`) {
                    return node;
                  }
                }
                return undefined;
              }).pipe(runtime.runPromise);

              expect(tupleType).toBeDefined();
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("creates tuple type structure with 2 position nodes as shadow children", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId, propertyName, frameId } =
          yield* createUnboundProperty("Category");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Wait for property section and trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Wait and verify tuple type structure
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const result = await Effect.gen(function* () {
                const Store = yield* StoreT;
                const nodes = yield* Store.query(
                  queryDb(tables.nodes.select()),
                );

                // Find the tuple type
                const tupleType = nodes.find((node) => {
                  const text = Yjs.getText(node.id as Id.Node).toString();
                  return text === `${propertyName}_Tuple`;
                });

                if (!tupleType)
                  return null as null | {
                    tupleType: (typeof nodes)[0];
                    positionNodes: unknown[];
                  };

                // Get shadow children (position nodes)
                const parentLinks = yield* Store.query(
                  queryDb(
                    tables.parentLinks
                      .select()
                      .where("parentId", "=", tupleType.id)
                      .where("inShadow", "=", true),
                  ),
                );

                return { tupleType, positionNodes: parentLinks };
              }).pipe(runtime.runPromise);

              expect(result).not.toBeNull();
              expect(result!.positionNodes.length).toBe(2);
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("position 0 title = property name, position 1 title = 'Is {name} For'", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId, propertyName, frameId } =
          yield* createUnboundProperty("Status");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Verify position node titles
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              type PositionTitle = { position: string; title: string };
              const result = await Effect.gen(function* () {
                const Store = yield* StoreT;
                const nodes = yield* Store.query(
                  queryDb(tables.nodes.select()),
                );

                // Find the tuple type
                const tupleType = nodes.find((node) => {
                  const text = Yjs.getText(node.id as Id.Node).toString();
                  return text === `${propertyName}_Tuple`;
                });

                if (!tupleType) return null as PositionTitle[] | null;

                // Get shadow children with their positions
                const parentLinks = yield* Store.query(
                  queryDb(
                    tables.parentLinks
                      .select()
                      .where("parentId", "=", tupleType.id)
                      .where("inShadow", "=", true)
                      .orderBy("position", "asc"),
                  ),
                );

                // Get titles for each position node
                const positionTitles: PositionTitle[] = parentLinks.map(
                  (link) => ({
                    position: link.position,
                    title: Yjs.getText(link.childId as Id.Node).toString(),
                  }),
                );

                return positionTitles;
              }).pipe(runtime.runPromise);

              expect(result).not.toBeNull();
              expect(result!.length).toBe(2);

              // One should be property name, other should be "Is {name} For"
              const titles = result!.map((p) => p.title);
              expect(titles).toContain(propertyName);
              expect(titles).toContain(`Is ${propertyName} For`);
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("property is bound with hostPosition=1, displayPosition=0", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId, propertyId, viewId, frameId } =
          yield* createUnboundProperty("Priority");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Verify property is initially unbound
        const propertiesBefore = yield* Property.getPropertiesForView(viewId);
        const propBefore = propertiesBefore.find((p) => p.id === propertyId);
        expect(propBefore?.isBound).toBe(false);

        // Trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Verify property is now bound with correct positions
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const properties = await Property.getPropertiesForView(
                viewId,
              ).pipe(runtime.runPromise);
              const prop = properties.find((p) => p.id === propertyId);

              expect(prop?.isBound).toBe(true);
              expect(prop?.hostPosition).toBe(1);
              expect(prop?.displayPosition).toBe(0);
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("shows ghost block (no linked block created yet)", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId, propertyId, frameId } =
          yield* createUnboundProperty("Tags");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Verify ghost block appears and NO linked block is created yet
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              // Ghost block should be visible
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();

              // No linked blocks should exist (user hasn't typed yet)
              const linkedBlocks = await Property.getLinkedBlocks(
                propertyId,
                rootNodeId,
              ).pipe(runtime.runPromise);

              expect(linkedBlocks.length).toBe(0);
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("focuses the ghost block after quick-create", async () => {
      await Effect.gen(function* () {
        const { rootNodeId, propertyId, frameId } =
          yield* createUnboundProperty("Assignee");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Wait for ghost block to be shown and focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Ghost block should be visible
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();

              // Ghost block should have a focused CodeMirror editor
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Arrow Right does NOT trigger for already-bound property", () => {
    it("does nothing special for already-bound property (just navigates normally)", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId, frameId } =
          yield* createUnboundProperty("BoundProp");

        // Create a tuple type and bind the property to it BEFORE testing
        const tupleTypeId = Id.Node.make(`test-tuple-type-${Date.now()}`);
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: tupleTypeId, parentId: System.SCHEMA },
          }),
        );
        Yjs.getText(tupleTypeId).insert(0, "ExistingTupleType");

        // Bind property to the tuple type
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Create a linked block so there's something to navigate to
        yield* Property.addLinkedBlock(propertyId, rootNodeId);

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Wait for property section
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");

        // Count tuple types before ArrowRight
        const nodesBefore = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountBefore = nodesBefore.filter((n) =>
          Yjs.getText(n.id as Id.Node)
            .toString()
            .includes("_Tuple"),
        ).length;

        yield* When.USER_PRESSES("{ArrowRight}");

        // Small delay to let any async operations complete
        yield* Effect.sleep("100 millis");

        // Verify no NEW tuple type was created
        const nodesAfter = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountAfter = nodesAfter.filter((n) =>
          Yjs.getText(n.id as Id.Node)
            .toString()
            .includes("_Tuple"),
        ).length;

        expect(tupleTypeCountAfter).toBe(tupleTypeCountBefore);
      }).pipe(runtime.runPromise);
    });

    it("navigates to ghost block when bound property has no linked blocks", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId, frameId } =
          yield* createUnboundProperty("EmptyBoundProp");

        // Create a tuple type and bind the property to it
        // This simulates a property that was previously set up via quick-create
        // but has no linked blocks yet
        const tupleTypeId = Id.Node.make(`test-tuple-type-${Date.now()}`);
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: tupleTypeId, parentId: System.SCHEMA },
          }),
        );
        Yjs.getText(tupleTypeId).insert(0, "ExistingTupleType");

        // Bind property to the tuple type (but do NOT create any linked blocks)
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Click property name to focus
        yield* clickPropertyName();

        // Move to end and press ArrowRight - should navigate to ghost block
        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Wait for ghost block to appear and be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Ghost block should be visible
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock).toBeTruthy();

              // Ghost block should have a focused CodeMirror editor
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("Arrow Right mid-text moves cursor normally (no trigger)", () => {
    it("moves cursor right when not at end of property name", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId, frameId } =
          yield* createUnboundProperty("LongPropertyName");

        render(() => (
          <PropertySection
            propertyId={propertyId}
            pageId={rootNodeId}
            frameId={frameId}
          />
        ));

        // Click property name to focus
        yield* clickPropertyName();

        // Move to start and then a few chars in (mid-text)
        yield* When.USER_PRESSES("{Home}");
        yield* When.USER_PRESSES("{ArrowRight}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Count tuple types before another ArrowRight
        const nodesBefore = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountBefore = nodesBefore.filter((n) =>
          Yjs.getText(n.id as Id.Node)
            .toString()
            .includes("_Tuple"),
        ).length;

        // Press ArrowRight mid-text - should just move cursor, not trigger quick-create
        yield* When.USER_PRESSES("{ArrowRight}");

        // Small delay
        yield* Effect.sleep("100 millis");

        // Verify no tuple type was created
        const nodesAfter = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountAfter = nodesAfter.filter((n) =>
          Yjs.getText(n.id as Id.Node)
            .toString()
            .includes("_Tuple"),
        ).length;

        expect(tupleTypeCountAfter).toBe(tupleTypeCountBefore);
      }).pipe(runtime.runPromise);
    });
  });

  describe("End-to-end flow via Frame", () => {
    it("typing '> ' then property name then ArrowRight shows focused ghost block", async () => {
      await Effect.gen(function* () {
        // Setup: frame with a child node (the trigger target)
        const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
          "Test Page",
          [{ text: "" }],
        );
        const childNodeId = childNodeIds[0];
        const childBlockId = Id.makeFrameBlockId(frameId, childNodeId);

        render(() => <FrameView frameId={frameId} />);

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

        // Type "> " to trigger property creation (this creates an unbound property)
        yield* When.USER_PRESSES(">");
        yield* When.USER_PRESSES(" ");

        // Wait for property section to appear and property name to be focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const propertySection = document.querySelector(
                '[data-testid="property-section"]',
              );
              expect(propertySection).toBeTruthy();
              const focusedEditor = propertySection!.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(focusedEditor).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        // Type a property name
        yield* When.USER_PRESSES("Project");

        // Ensure cursor is at end, then press ArrowRight to trigger quick-create
        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Assert: ghost block should be visible AND focused
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Ghost block should be visible
              const ghostBlock = document.querySelector(
                "[data-testid='ghost-block']",
              );
              expect(ghostBlock, "Ghost block should be visible").toBeTruthy();

              // Ghost block should have a focused CodeMirror editor
              const focusedEditor = ghostBlock!.querySelector(
                ".cm-editor.cm-focused",
              );
              expect(
                focusedEditor,
                "Ghost block should have focused CodeMirror editor",
              ).toBeTruthy();
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
