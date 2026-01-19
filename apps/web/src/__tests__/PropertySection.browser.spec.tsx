import "@/index.css";
import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import EditorBuffer from "@/ui/EditorBuffer";
import PropertySection from "@/ui/PropertySection";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { waitFor } from "solid-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "./bdd";

/**
 * PropertySection Component Tests
 *
 * PropertySection is a display-only component that renders:
 * - Property name from Y.Text
 * - Linked blocks as plain text (when property has bound tuple type)
 *
 * This is the initial display-only version - interactivity comes later.
 */

describe("PropertySection", () => {
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

  /** Creates a tuple type node for testing linked blocks */
  const createTupleType = (name: string) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Yjs = yield* YjsT;
      const tupleTypeId = Id.Node.make(nanoid());

      // Create node as shadow child of SCHEMA
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: tupleTypeId, parentId: System.SCHEMA, position: "" },
        }),
      );
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId: tupleTypeId,
            newParentId: System.SCHEMA,
            position: "",
            inShadow: true,
          },
        }),
      );

      // Set title
      Yjs.getText(tupleTypeId).insert(0, name);

      return tupleTypeId;
    });

  /** Creates a simple page node */
  const createPage = () =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const pageId = Id.Node.make(nanoid());

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: pageId },
        }),
      );

      return pageId;
    });

  /** Sets title text on a node */
  const setTitle = (nodeId: Id.Node, title: string) =>
    Effect.gen(function* () {
      const Yjs = yield* YjsT;
      const ytext = Yjs.getText(nodeId);
      ytext.delete(0, ytext.length);
      ytext.insert(0, title);
    });

  /** Creates a linked node with text */
  const createLinkedNode = (text: string) =>
    Effect.gen(function* () {
      const nodeId = yield* createPage();
      yield* setTitle(nodeId, text);
      return nodeId;
    });

  describe("renders property name from Y.Text", () => {
    it("displays property name when rendered directly", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;
        const Yjs = yield* YjsT;

        // Setup: create a page, view, and property
        const { rootNodeId: pageId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Page",
          [],
        );
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);

        // Set property name via Y.Text
        Yjs.getText(propertyId).insert(0, "My Property Name");

        // Render the PropertySection directly
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Buffer", []);
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Assert: property name is visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const text = document.body.textContent;
              expect(text).toContain("My Property Name");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("displays empty property name when Y.Text is empty", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;

        // Setup: create a page, view, and property with empty name
        const { rootNodeId: pageId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Page",
          [],
        );
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);

        // Don't set any text - property name should be empty

        // Render the PropertySection
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Buffer", []);
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Assert: component renders without error (no crash on empty name)
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
      }).pipe(runtime.runPromise);
    });
  });

  describe("renders linked block titles", () => {
    it("displays linked block titles when property has bound tuple type", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;
        const Tuple = yield* TupleT;
        const Yjs = yield* YjsT;

        // Setup: create a page, view, and property
        const { rootNodeId: pageId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Page",
          [],
        );
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);
        Yjs.getText(propertyId).insert(0, "Related Items");

        // Create a tuple type and bind the property to it
        const tupleTypeId = yield* createTupleType("RelatedTo");
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Create linked nodes and tuple instances
        const linkedNode1 = yield* createLinkedNode("Linked Item One");
        const linkedNode2 = yield* createLinkedNode("Linked Item Two");

        // Create tuples: (page, linkedNode)
        yield* Tuple.create(tupleTypeId, [pageId, linkedNode1]);
        yield* Tuple.create(tupleTypeId, [pageId, linkedNode2]);

        // Render the PropertySection
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Buffer", []);
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Assert: both linked block titles are visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const text = document.body.textContent;
              expect(text).toContain("Linked Item One");
              expect(text).toContain("Linked Item Two");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("displays placeholder text for linked blocks when property is unbound", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;
        const Yjs = yield* YjsT;

        // Setup: create a page, view, and property (unbound)
        const { rootNodeId: pageId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Page",
          [],
        );
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);
        Yjs.getText(propertyId).insert(0, "Unbound Property");

        // Don't bind to any tuple type

        // Render the PropertySection
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Buffer", []);
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Assert: property name is visible and "no linked items" placeholder shown
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const text = document.body.textContent;
              expect(text).toContain("Unbound Property");
              expect(text).toContain("no linked items");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });

    it("displays empty list when property is bound but has no linked blocks", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;
        const Yjs = yield* YjsT;

        // Setup: create a page, view, and property
        const { rootNodeId: pageId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Page",
          [],
        );
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);
        Yjs.getText(propertyId).insert(0, "Empty Bound Property");

        // Create tuple type and bind, but don't create any tuple instances
        const tupleTypeId = yield* createTupleType("EmptyRelation");
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Render the PropertySection
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Buffer", []);
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Assert: property name visible, linked blocks section exists but empty
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const text = document.body.textContent;
              expect(text).toContain("Empty Bound Property");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("EditorBuffer integration", () => {
    it("shows nothing when view has no properties", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;

        // Setup: create a buffer with a root node
        const { bufferId, rootNodeId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Page Without Properties",
          [{ text: "Some content" }],
        );

        // Create view but don't add any properties
        yield* View.getOrCreateView(rootNodeId);

        // Render EditorBuffer
        render(() => <EditorBuffer bufferId={bufferId} />);

        // Assert: EditorBuffer renders without property sections
        yield* Effect.promise(() =>
          waitFor(
            () => {
              // Page title should be visible
              expect(document.body.textContent).toContain(
                "Page Without Properties",
              );
              // No property sections should exist
              const propertySections = document.querySelectorAll(
                "[data-testid='property-section']",
              );
              expect(propertySections.length).toBe(0);
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("linked block rendering", () => {
    it("renders linked blocks as Block components", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;
        const Tuple = yield* TupleT;
        const Yjs = yield* YjsT;

        // Setup: create a full hierarchy
        const { rootNodeId: pageId, bufferId } =
          yield* Given.A_FULL_HIERARCHY_WITH_CHILDREN("Test Page", []);
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);
        Yjs.getText(propertyId).insert(0, "Related Items");

        // Create a tuple type and bind the property to it
        const tupleTypeId = yield* createTupleType("RelatedTo");
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Create a linked node and tuple instance
        const linkedNode = yield* createLinkedNode("Target Node");

        // Create tuple: (page, linkedNode)
        yield* Tuple.create(tupleTypeId, [pageId, linkedNode]);

        // Render the PropertySection
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Wait for linked block to appear as a Block component (not a button)
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const text = document.body.textContent;
              expect(text).toContain("Target Node");
              // Verify it's a Block component, not a button
              const blockElement = document.querySelector(
                "[data-testid='linked-blocks'] [data-element-type='block']",
              );
              expect(blockElement).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("reactive updates", () => {
    it("updates reactively when property name changes in Y.Text", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const View = yield* ViewT;
        const Yjs = yield* YjsT;

        // Setup: create a page, view, and property
        const { rootNodeId: pageId } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Test Page",
          [],
        );
        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);

        // Set initial property name
        const ytext = Yjs.getText(propertyId);
        ytext.insert(0, "Initial Name");

        // Render the PropertySection
        const { bufferId } = yield* Given.A_BUFFER_WITH_CHILDREN("Buffer", []);
        render(() => <PropertySection propertyId={propertyId} pageId={pageId} bufferId={bufferId} />);

        // Assert: initial name is visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              expect(document.body.textContent).toContain("Initial Name");
            },
            { timeout: 2000 },
          ),
        );

        // Update the property name
        ytext.delete(0, ytext.length);
        ytext.insert(0, "Updated Name");

        // Assert: updated name is now visible
        yield* Effect.promise(() =>
          waitFor(
            () => {
              expect(document.body.textContent).toContain("Updated Name");
              expect(document.body.textContent).not.toContain("Initial Name");
            },
            { timeout: 2000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });
});
