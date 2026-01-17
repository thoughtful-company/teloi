import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import PropertySection from "@/ui/PropertySection";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, When, type BrowserRuntime } from "./bdd";

/**
 * Property Quick-Create Tests
 *
 * When user presses Arrow Right at the END of an unbound property name, it should:
 * 1. Create a Tuple Type named "{propertyName}_Tuple"
 * 2. Create two position nodes as shadow children: position 0 = property name, position 1 = "Is {name} For"
 * 3. Bind property to tuple type (hostPosition: 1, displayPosition: 0)
 * 4. Create initial linked block (tuple instance)
 * 5. Focus the new linked block
 *
 * Tests render PropertySection directly since EditorBuffer integration is a separate concern.
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
      const Yjs = yield* YjsT;

      // Create a page with a child node
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Test Page", [
          { text: "some content" },
        ]);

      // Create view and property for the page
      const viewId = yield* View.getOrCreateView(rootNodeId);
      const propertyId = yield* Property.createProperty(viewId);

      // Set property name via Y.Text
      Yjs.getText(propertyId).insert(0, propertyName);

      return {
        bufferId,
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
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId, propertyName } =
          yield* createUnboundProperty("Author");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
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
              const tupleTypes = await Effect.gen(function* () {
                const Store = yield* StoreT;
                const nodes = yield* Store.query(
                  queryDb(tables.nodes.select()),
                );
                return nodes;
              }).pipe(runtime.runPromise);

              // Find the tuple type by checking Y.Text
              const tupleType = tupleTypes.find((node) => {
                const text = Yjs.getText(node.id as Id.Node).toString();
                return text === `${propertyName}_Tuple`;
              });

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

        const { rootNodeId, propertyId, propertyName } =
          yield* createUnboundProperty("Category");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
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

        const { rootNodeId, propertyId, propertyName } =
          yield* createUnboundProperty("Status");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
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

        const { rootNodeId, propertyId, viewId } =
          yield* createUnboundProperty("Priority");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
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

    it("creates initial linked block (tuple instance)", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId, propertyId } =
          yield* createUnboundProperty("Tags");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
        ));

        // Trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Verify a linked block was created
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const linkedBlocks = await Property.getLinkedBlocks(
                propertyId,
                rootNodeId,
              ).pipe(runtime.runPromise);

              expect(linkedBlocks.length).toBeGreaterThan(0);
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("focuses the new linked block after creation", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { rootNodeId, propertyId } =
          yield* createUnboundProperty("Assignee");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
        ));

        // Trigger quick-create
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");
        yield* When.USER_PRESSES("{ArrowRight}");

        // Wait for linked block to be created and focused
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const linkedBlocks = await Property.getLinkedBlocks(
                propertyId,
                rootNodeId,
              ).pipe(runtime.runPromise);

              expect(linkedBlocks.length).toBeGreaterThan(0);

              // Check that focus is on a linked block element or CodeMirror inside it
              const focusedEl = document.activeElement;
              expect(
                focusedEl?.closest("[data-testid='linked-blocks']") ||
                  focusedEl?.closest(".cm-editor"),
              ).toBeTruthy();
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

        const { rootNodeId, propertyId } =
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
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
        ));

        // Wait for property section
        yield* clickPropertyName();

        yield* When.USER_PRESSES("{End}");

        // Count tuple types before ArrowRight
        const nodesBefore = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountBefore = nodesBefore.filter((n) =>
          Yjs.getText(n.id as Id.Node).toString().includes("_Tuple"),
        ).length;

        yield* When.USER_PRESSES("{ArrowRight}");

        // Small delay to let any async operations complete
        yield* Effect.sleep("100 millis");

        // Verify no NEW tuple type was created
        const nodesAfter = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountAfter = nodesAfter.filter((n) =>
          Yjs.getText(n.id as Id.Node).toString().includes("_Tuple"),
        ).length;

        expect(tupleTypeCountAfter).toBe(tupleTypeCountBefore);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Arrow Right mid-text moves cursor normally (no trigger)", () => {
    it("moves cursor right when not at end of property name", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;

        const { rootNodeId, propertyId } =
          yield* createUnboundProperty("LongPropertyName");

        render(() => (
          <PropertySection propertyId={propertyId} pageId={rootNodeId} />
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
          Yjs.getText(n.id as Id.Node).toString().includes("_Tuple"),
        ).length;

        // Press ArrowRight mid-text - should just move cursor, not trigger quick-create
        yield* When.USER_PRESSES("{ArrowRight}");

        // Small delay
        yield* Effect.sleep("100 millis");

        // Verify no tuple type was created
        const nodesAfter = yield* Store.query(queryDb(tables.nodes.select()));
        const tupleTypeCountAfter = nodesAfter.filter((n) =>
          Yjs.getText(n.id as Id.Node).toString().includes("_Tuple"),
        ).length;

        expect(tupleTypeCountAfter).toBe(tupleTypeCountBefore);
      }).pipe(runtime.runPromise);
    });
  });
});
