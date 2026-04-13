import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { AutomergeT } from "@/services/external/Automerge";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it } from "vitest";
import { setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

/**
 * Property Service Tests
 *
 * Properties define how relationships are displayed on pages.
 * They are children of SCHEMA, linked to views via HAS_PROPERTY tuples,
 * and can be bound to tuple types for actual data display.
 */

describe("PropertyT", () => {
  let runtime: BrowserRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  /** Creates a page node for testing */
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

  /** Creates a view for a page using ViewT */
  const createView = (pageId: Id.Node) =>
    Effect.gen(function* () {
      const View = yield* ViewT;
      return yield* View.getOrCreateView(pageId);
    });

  /** Creates a tuple type node for binding tests */
  const createTupleType = (name: string) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Automerge = yield* AutomergeT;
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
      yield* Automerge.setText(tupleTypeId, name);

      return tupleTypeId;
    });

  /** Sets title text on a node */
  const setTitle = (nodeId: Id.Node, title: string) =>
    Effect.gen(function* () {
      const Automerge = yield* AutomergeT;
      yield* Automerge.setText(nodeId, title);
    });

  describe("createProperty", () => {
    it("creates property node as child of System.SCHEMA", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);

        const propertyId = yield* Property.createProperty(viewId);

        // Verify node exists
        const node = yield* Store.query(
          queryDb(tables.nodes.select().where({ id: propertyId }).first()),
        );
        expect(node).toBeDefined();

        // Verify parent is SCHEMA
        const link = yield* Store.query(
          queryDb(
            tables.parentLinks.select().where({ childId: propertyId }).first(),
          ),
        );
        expect(link).toBeDefined();
        expect(link!.parentId).toBe(System.SCHEMA);
      }).pipe(runtime.runPromise);
    });

    it("sets property type to System.PROPERTY", async () => {
      await Effect.gen(function* () {
        const Type = yield* TypeT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);

        const propertyId = yield* Property.createProperty(viewId);

        // Check node has type PROPERTY via nodeTypes table
        const hasPropertyType = yield* Type.hasType(
          propertyId,
          System.PROPERTY,
        );
        expect(hasPropertyType).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("creates HAS_PROPERTY tuple linking view to property", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);

        const propertyId = yield* Property.createProperty(viewId);

        // Verify HAS_PROPERTY tuple exists
        const tuples = yield* Tuple.findByPosition(
          System.HAS_PROPERTY,
          0,
          viewId,
        );
        expect(tuples).toHaveLength(1);
        const tuple = tuples[0];
        expect(tuple).toBeDefined();
        expect(tuple!.members[0]).toBe(viewId);
        expect(tuple!.members[1]).toBe(propertyId);
      }).pipe(runtime.runPromise);
    });
  });

  describe("getPropertiesForView", () => {
    it("returns empty array when no properties exist", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);

        const properties = yield* Property.getPropertiesForView(viewId);

        expect(properties).toEqual([]);
      }).pipe(runtime.runPromise);
    });

    it("returns PropertyInfo with title and isBound: false for unbound property", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);

        const propertyId = yield* Property.createProperty(viewId);
        yield* setTitle(propertyId, "My Property");

        const properties = yield* Property.getPropertiesForView(viewId);

        expect(properties).toHaveLength(1);
        expect(properties[0]).toMatchObject({
          id: propertyId,
          title: "My Property",
          isBound: false,
        });
        expect(properties[0]!.tupleTypeId).toBeUndefined();
        expect(properties[0]!.hostPosition).toBeUndefined();
        expect(properties[0]!.displayPosition).toBeUndefined();
      }).pipe(runtime.runPromise);
    });

    it("returns PropertyInfo with binding info when property is bound", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        yield* setTitle(propertyId, "Bound Property");
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        const properties = yield* Property.getPropertiesForView(viewId);

        expect(properties).toHaveLength(1);
        expect(properties[0]).toMatchObject({
          id: propertyId,
          title: "Bound Property",
          isBound: true,
          tupleTypeId,
          hostPosition: 0,
          displayPosition: 1,
        });
      }).pipe(runtime.runPromise);
    });
  });

  describe("bindToTupleType", () => {
    it("creates PROPERTY_USES_TUPLE tuple linking property to tuple type", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Verify PROPERTY_USES_TUPLE tuple exists
        const tuples = yield* Tuple.findByPosition(
          System.PROPERTY_USES_TUPLE,
          0,
          propertyId,
        );
        expect(tuples).toHaveLength(1);
        expect(tuples[0]!.members[0]).toBe(propertyId);
        expect(tuples[0]!.members[1]).toBe(tupleTypeId);
      }).pipe(runtime.runPromise);
    });

    it("creates PROPERTY_CONFIG tuple with position values", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Verify PROPERTY_CONFIG tuple exists with correct positions
        const tuples = yield* Tuple.findByPosition(
          System.PROPERTY_CONFIG,
          0,
          propertyId,
        );
        expect(tuples).toHaveLength(1);
        expect(tuples[0]!.members[0]).toBe(propertyId);
        expect(tuples[0]!.members[1]).toBe(System.POSITION_0); // hostPosition 0
        expect(tuples[0]!.members[2]).toBe(System.POSITION_1); // displayPosition 1
      }).pipe(runtime.runPromise);
    });

    it("property becomes bound (isBound: true in getPropertiesForView)", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);

        // Before binding
        const propertiesBefore = yield* Property.getPropertiesForView(viewId);
        expect(propertiesBefore[0]!.isBound).toBe(false);

        // After binding
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 1, 0);
        const propertiesAfter = yield* Property.getPropertiesForView(viewId);
        expect(propertiesAfter[0]!.isBound).toBe(true);
      }).pipe(runtime.runPromise);
    });
  });

  describe("getLinkedBlocks", () => {
    it("returns empty array when no linked blocks exist", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        const linkedBlocks = yield* Property.getLinkedBlocks(
          propertyId,
          pageId,
        );

        expect(linkedBlocks).toEqual([]);
      }).pipe(runtime.runPromise);
    });

    it("returns node IDs from tuple instances where page is at hostPosition", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        // hostPosition 0 means page is at position 0, display node at position 1
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        // Create some linked nodes manually using the tuple type
        const linkedNode1 = yield* createPage();
        const linkedNode2 = yield* createPage();
        yield* setTitle(linkedNode1, "Linked 1");
        yield* setTitle(linkedNode2, "Linked 2");

        // Create tuple instances: (page, linkedNode)
        yield* Tuple.create(tupleTypeId, [pageId, linkedNode1]);
        yield* Tuple.create(tupleTypeId, [pageId, linkedNode2]);

        const linkedBlocks = yield* Property.getLinkedBlocks(
          propertyId,
          pageId,
        );

        expect(linkedBlocks).toHaveLength(2);
        expect(linkedBlocks).toContain(linkedNode1);
        expect(linkedBlocks).toContain(linkedNode2);
      }).pipe(runtime.runPromise);
    });

    it("returns correct nodes when hostPosition is 1", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        // hostPosition 1 means page is at position 1, display node at position 0
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 1, 0);

        // Create some linked nodes manually using the tuple type
        const linkedNode1 = yield* createPage();
        const linkedNode2 = yield* createPage();

        // Create tuple instances: (linkedNode, page)
        yield* Tuple.create(tupleTypeId, [linkedNode1, pageId]);
        yield* Tuple.create(tupleTypeId, [linkedNode2, pageId]);

        const linkedBlocks = yield* Property.getLinkedBlocks(
          propertyId,
          pageId,
        );

        expect(linkedBlocks).toHaveLength(2);
        expect(linkedBlocks).toContain(linkedNode1);
        expect(linkedBlocks).toContain(linkedNode2);
      }).pipe(runtime.runPromise);
    });
  });

  describe("addLinkedBlock", () => {
    it("creates new node", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        const newNodeId = yield* Property.addLinkedBlock(propertyId, pageId);

        // Verify node exists
        const node = yield* Store.query(
          queryDb(tables.nodes.select().where({ id: newNodeId }).first()),
        );
        expect(node).toBeDefined();
      }).pipe(runtime.runPromise);
    });

    it("creates tuple instance with bound tuple type", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        // hostPosition 0, displayPosition 1 means: (page, newNode)
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        const newNodeId = yield* Property.addLinkedBlock(propertyId, pageId);

        // Verify tuple was created with the correct structure
        const tuples = yield* Tuple.findByPosition(tupleTypeId, 0, pageId);
        expect(tuples).toHaveLength(1);
        expect(tuples[0]!.members[0]).toBe(pageId); // hostPosition 0
        expect(tuples[0]!.members[1]).toBe(newNodeId); // displayPosition 1
      }).pipe(runtime.runPromise);
    });

    it("creates tuple with correct positions when hostPosition is 1", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        // hostPosition 1, displayPosition 0 means: (newNode, page)
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 1, 0);

        const newNodeId = yield* Property.addLinkedBlock(propertyId, pageId);

        // Verify tuple was created with the correct structure
        const tuples = yield* Tuple.findByPosition(tupleTypeId, 1, pageId);
        expect(tuples).toHaveLength(1);
        expect(tuples[0]!.members[0]).toBe(newNodeId); // displayPosition 0
        expect(tuples[0]!.members[1]).toBe(pageId); // hostPosition 1
      }).pipe(runtime.runPromise);
    });

    it("returns new node ID", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;
        const pageId = yield* createPage();
        const viewId = yield* createView(pageId);
        const tupleTypeId = yield* createTupleType("TestTupleType");

        const propertyId = yield* Property.createProperty(viewId);
        yield* Property.bindToTupleType(propertyId, tupleTypeId, 0, 1);

        const newNodeId = yield* Property.addLinkedBlock(propertyId, pageId);

        // Verify it appears in getLinkedBlocks
        const linkedBlocks = yield* Property.getLinkedBlocks(
          propertyId,
          pageId,
        );
        expect(linkedBlocks).toContain(newNodeId);
      }).pipe(runtime.runPromise);
    });
  });
});
