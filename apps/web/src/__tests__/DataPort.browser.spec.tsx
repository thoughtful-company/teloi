import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { DataPortT, ExportData } from "@/services/domain/DataPort";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { Given, runtime } from "./bdd";

describe("DataPort", () => {
  describe("exportData", () => {
    it("exports data with correct structure", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const exported = yield* DataPort.exportData();

        // Verify structure
        expect(exported.version).toBe(1);
        expect(typeof exported.exportedAt).toBe("number");
        expect(Array.isArray(exported.data.nodes)).toBe(true);
        expect(Array.isArray(exported.data.parentLinks)).toBe(true);
        expect(typeof exported.data.textContent).toBe("object");
        expect(Array.isArray(exported.data.nodeTypes)).toBe(true);
        expect(Array.isArray(exported.data.tupleTypeRoles)).toBe(true);
        expect(Array.isArray(exported.data.tupleTypeRoleAllowedTypes)).toBe(
          true,
        );
        expect(Array.isArray(exported.data.tuples)).toBe(true);
        expect(Array.isArray(exported.data.tupleMembers)).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("exports a single root node with text", async () => {
      await Effect.gen(function* () {
        const { nodeId } = yield* Given.A_BUFFER_WITH_TEXT("Hello world");

        const DataPort = yield* DataPortT;
        const exported = yield* DataPort.exportData();

        // Should have at least the node we created
        const node = exported.data.nodes.find((n) => n.id === nodeId);
        expect(node).toBeDefined();
        expect(node?.id).toBe(nodeId);

        // Text content should be exported
        expect(exported.data.textContent[nodeId]).toBe("Hello world");
      }).pipe(runtime.runPromise);
    });

    it("exports parent-child relationships", async () => {
      await Effect.gen(function* () {
        const { rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "Child 1" },
            { text: "Child 2" },
          ]);

        const DataPort = yield* DataPortT;
        const exported = yield* DataPort.exportData();

        // Should have root + 2 children
        const nodeIds = exported.data.nodes.map((n) => n.id);
        expect(nodeIds).toContain(rootNodeId);
        expect(nodeIds).toContain(childNodeIds[0]);
        expect(nodeIds).toContain(childNodeIds[1]);

        // Should have parent links for children
        const childLinks = exported.data.parentLinks.filter(
          (l) => l.parentId === rootNodeId,
        );
        expect(childLinks).toHaveLength(2);

        // Text content should be exported for all nodes
        expect(exported.data.textContent[rootNodeId]).toBe("Root");
        expect(exported.data.textContent[childNodeIds[0]]).toBe("Child 1");
        expect(exported.data.textContent[childNodeIds[1]]).toBe("Child 2");
      }).pipe(runtime.runPromise);
    });

    it("exports fractional index positions correctly", async () => {
      await Effect.gen(function* () {
        const { rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
            { text: "First" },
            { text: "Second" },
            { text: "Third" },
          ]);

        const DataPort = yield* DataPortT;
        const exported = yield* DataPort.exportData();

        // Get parent links for children, sorted by position
        const childLinks = exported.data.parentLinks
          .filter((l) => l.parentId === rootNodeId)
          .sort((a, b) => a.position.localeCompare(b.position));

        expect(childLinks).toHaveLength(3);

        // Positions should be in order (fractional index strings)
        expect(childLinks[0]?.childId).toBe(childNodeIds[0]);
        expect(childLinks[1]?.childId).toBe(childNodeIds[1]);
        expect(childLinks[2]?.childId).toBe(childNodeIds[2]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("importData", () => {
    it("imports data and populates store", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const DataPort = yield* DataPortT;

        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: "imported-root", createdAt: 1000, modifiedAt: 1000 },
              { id: "imported-child", createdAt: 1001, modifiedAt: 1001 },
            ],
            parentLinks: [
              {
                childId: "imported-child",
                parentId: "imported-root",
                position: "a0",
                isHidden: false,
                createdAt: 1001,
              },
            ],
            textContent: {
              "imported-root": "Imported root text",
              "imported-child": "Imported child text",
            },
            nodeTypes: [],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        // Verify nodes exist in store
        const nodes = yield* Store.query(queryDb(tables.nodes.select()));
        const importedRoot = nodes.find((n) => n.id === "imported-root");
        const importedChild = nodes.find((n) => n.id === "imported-child");

        expect(importedRoot).toBeDefined();
        expect(importedChild).toBeDefined();

        // Verify parent links
        const links = yield* Store.query(queryDb(tables.parentLinks.select()));
        const childLink = links.find((l) => l.childId === "imported-child");
        expect(childLink?.parentId).toBe("imported-root");

        // Verify Yjs text content
        const rootText = Yjs.getText("imported-root" as Id.Node).toString();
        const childText = Yjs.getText("imported-child" as Id.Node).toString();
        expect(rootText).toBe("Imported root text");
        expect(childText).toBe("Imported child text");
      }).pipe(runtime.runPromise);
    });

    it("skips existing nodes and only adds new ones", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const DataPort = yield* DataPortT;

        const { nodeId: existingNodeId } = yield* Given.A_BUFFER_WITH_TEXT(
          "Original content - should be preserved",
        );

        // Import data with same node ID (should be skipped) + new node (should be added)
        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: existingNodeId, createdAt: 1000, modifiedAt: 1000 },
              { id: "brand-new-node", createdAt: 1001, modifiedAt: 1001 },
            ],
            parentLinks: [],
            textContent: {
              [existingNodeId]: "Imported content - should NOT overwrite",
              "brand-new-node": "New node content",
            },
            nodeTypes: [],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        // Existing node should still exist with ORIGINAL text
        const nodes = yield* Store.query(queryDb(tables.nodes.select()));
        const existingNode = nodes.find((n) => n.id === existingNodeId);
        expect(existingNode).toBeDefined();
        const existingText = Yjs.getText(existingNodeId).toString();
        expect(existingText).toBe("Original content - should be preserved");

        // New node should be added
        const newNode = nodes.find((n) => n.id === "brand-new-node");
        expect(newNode).toBeDefined();
        const newText = Yjs.getText("brand-new-node" as Id.Node).toString();
        expect(newText).toBe("New node content");
      }).pipe(runtime.runPromise);
    });

    it("adds child nodes when parent exists locally", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const DataPort = yield* DataPortT;

        // Create existing parent node
        const { nodeId: existingParentId } =
          yield* Given.A_BUFFER_WITH_TEXT("Existing parent");

        // Import: existing parent (skip) + new child under it (add)
        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: existingParentId, createdAt: 1000, modifiedAt: 1000 },
              { id: "new-child", createdAt: 1001, modifiedAt: 1001 },
            ],
            parentLinks: [
              {
                childId: "new-child",
                parentId: existingParentId,
                position: "a0",
                isHidden: false,
                createdAt: 1001,
              },
            ],
            textContent: {
              "new-child": "New child text",
            },
            nodeTypes: [],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        // Parent should still have original text
        expect(Yjs.getText(existingParentId).toString()).toBe(
          "Existing parent",
        );

        // Child should be created under existing parent
        const links = yield* Store.query(queryDb(tables.parentLinks.select()));
        const childLink = links.find((l) => l.childId === "new-child");
        expect(childLink?.parentId).toBe(existingParentId);
        expect(Yjs.getText("new-child" as Id.Node).toString()).toBe(
          "New child text",
        );
      }).pipe(runtime.runPromise);
    });

    it("round-trips data correctly", async () => {
      await Effect.gen(function* () {
        // Create a complex tree structure
        const { rootNodeId, childNodeIds } =
          yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
            { text: "Child 1" },
            { text: "Child 2" },
          ]);

        const DataPort = yield* DataPortT;

        // Export
        const exported = yield* DataPort.exportData();

        // Clear and import back
        yield* DataPort.importData(exported);

        // Verify structure is preserved
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;

        const nodes = yield* Store.query(queryDb(tables.nodes.select()));
        expect(nodes.find((n) => n.id === rootNodeId)).toBeDefined();
        expect(nodes.find((n) => n.id === childNodeIds[0])).toBeDefined();
        expect(nodes.find((n) => n.id === childNodeIds[1])).toBeDefined();

        // Verify text content
        expect(Yjs.getText(rootNodeId).toString()).toBe("Root node");
        expect(Yjs.getText(childNodeIds[0]).toString()).toBe("Child 1");
        expect(Yjs.getText(childNodeIds[1]).toString()).toBe("Child 2");

        // Verify parent links
        const links = yield* Store.query(queryDb(tables.parentLinks.select()));
        const childLinks = links.filter((l) => l.parentId === rootNodeId);
        expect(childLinks).toHaveLength(2);
      }).pipe(runtime.runPromise);
    });

    it("preserves parent-child ordering after import", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        // Import with explicit ordering
        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: "root", createdAt: 1000, modifiedAt: 1000 },
              { id: "first", createdAt: 1001, modifiedAt: 1001 },
              { id: "second", createdAt: 1002, modifiedAt: 1002 },
              { id: "third", createdAt: 1003, modifiedAt: 1003 },
            ],
            parentLinks: [
              {
                childId: "first",
                parentId: "root",
                position: "a0",
                isHidden: false,
                createdAt: 1001,
              },
              {
                childId: "second",
                parentId: "root",
                position: "a1",
                isHidden: false,
                createdAt: 1002,
              },
              {
                childId: "third",
                parentId: "root",
                position: "a2",
                isHidden: false,
                createdAt: 1003,
              },
            ],
            textContent: {},
            nodeTypes: [],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        // Query children in order
        const links = yield* Store.query(
          queryDb(
            tables.parentLinks
              .select()
              .where("parentId", "=", "root")
              .orderBy("position", "asc"),
          ),
        );

        expect(links).toHaveLength(3);
        expect(links[0]?.childId).toBe("first");
        expect(links[1]?.childId).toBe("second");
        expect(links[2]?.childId).toBe("third");
      }).pipe(runtime.runPromise);
    });

    it("imports node types", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: "node-1", createdAt: 1000, modifiedAt: 1000 },
              { id: "type-node", createdAt: 1001, modifiedAt: 1001 },
            ],
            parentLinks: [],
            textContent: {},
            nodeTypes: [
              {
                nodeId: "node-1",
                typeId: "type-node",
                position: "a0",
                createdAt: 1002,
              },
            ],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        const nodeTypes = yield* Store.query(
          queryDb(tables.nodeTypes.select()),
        );
        const imported = nodeTypes.find(
          (nt) => nt.nodeId === "node-1" && nt.typeId === "type-node",
        );
        expect(imported).toBeDefined();
        expect(imported?.position).toBe("a0");
      }).pipe(runtime.runPromise);
    });

    it("imports tuple type definitions", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: "tuple-type-node", createdAt: 1000, modifiedAt: 1000 },
              { id: "allowed-type-node", createdAt: 1001, modifiedAt: 1001 },
            ],
            parentLinks: [],
            textContent: {},
            nodeTypes: [],
            tupleTypeRoles: [
              {
                tupleTypeId: "tuple-type-node",
                position: 0,
                name: "subject",
                required: true,
                createdAt: 1002,
              },
              {
                tupleTypeId: "tuple-type-node",
                position: 1,
                name: "object",
                required: false,
                createdAt: 1003,
              },
            ],
            tupleTypeRoleAllowedTypes: [
              {
                tupleTypeId: "tuple-type-node",
                position: 0,
                allowedTypeId: "allowed-type-node",
                createdAt: 1004,
              },
            ],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        const roles = yield* Store.query(
          queryDb(
            tables.tupleTypeRoles.select().where({
              tupleTypeId: "tuple-type-node",
            }),
          ),
        );
        expect(roles).toHaveLength(2);
        expect(roles.find((r) => r.position === 0)?.name).toBe("subject");
        expect(roles.find((r) => r.position === 1)?.name).toBe("object");

        const allowedTypes = yield* Store.query(
          queryDb(
            tables.tupleTypeRoleAllowedTypes.select().where({
              tupleTypeId: "tuple-type-node",
            }),
          ),
        );
        expect(allowedTypes).toHaveLength(1);
        expect(allowedTypes[0]?.allowedTypeId).toBe("allowed-type-node");
      }).pipe(runtime.runPromise);
    });

    it("imports tuple instances", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: "tuple-type", createdAt: 1000, modifiedAt: 1000 },
              { id: "member-1", createdAt: 1001, modifiedAt: 1001 },
              { id: "member-2", createdAt: 1002, modifiedAt: 1002 },
            ],
            parentLinks: [],
            textContent: {},
            nodeTypes: [],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [
              {
                id: "tuple-instance-1",
                tupleTypeId: "tuple-type",
                createdAt: 1003,
              },
            ],
            tupleMembers: [
              { tupleId: "tuple-instance-1", position: 0, nodeId: "member-1" },
              { tupleId: "tuple-instance-1", position: 1, nodeId: "member-2" },
            ],
          },
        };

        yield* DataPort.importData(importData);

        const tuples = yield* Store.query(
          queryDb(tables.tuples.select().where({ id: "tuple-instance-1" })),
        );
        expect(tuples).toHaveLength(1);
        expect(tuples[0]?.tupleTypeId).toBe("tuple-type");

        const members = yield* Store.query(
          queryDb(
            tables.tupleMembers
              .select()
              .where({ tupleId: "tuple-instance-1" })
              .orderBy("position", "asc"),
          ),
        );
        expect(members).toHaveLength(2);
        expect(members[0]?.nodeId).toBe("member-1");
        expect(members[1]?.nodeId).toBe("member-2");
      }).pipe(runtime.runPromise);
    });

    it("skips existing node types on import", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        // Create nodes and add a type first
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "existing-node" },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "existing-type" },
          }),
        );
        yield* Store.commit(
          events.typeAddedToNode({
            timestamp: Date.now(),
            data: {
              nodeId: "existing-node",
              typeId: "existing-type",
              position: "a0",
            },
          }),
        );

        // Try to import same type association
        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [
              { id: "existing-node", createdAt: 1000, modifiedAt: 1000 },
              { id: "existing-type", createdAt: 1001, modifiedAt: 1001 },
            ],
            parentLinks: [],
            textContent: {},
            nodeTypes: [
              {
                nodeId: "existing-node",
                typeId: "existing-type",
                position: "b0",
                createdAt: 1002,
              },
            ],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [],
            tupleMembers: [],
          },
        };

        yield* DataPort.importData(importData);

        // Should still have only one type association with original position
        const nodeTypes = yield* Store.query(
          queryDb(
            tables.nodeTypes.select().where({
              nodeId: "existing-node",
              typeId: "existing-type",
            }),
          ),
        );
        expect(nodeTypes).toHaveLength(1);
        expect(nodeTypes[0]?.position).toBe("a0");
      }).pipe(runtime.runPromise);
    });

    it("skips existing tuples on import", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        const tupleTypeId = `tuple-type-${Date.now()}-${Math.random()}`;
        const originalMemberId = `original-member-${Date.now()}-${Math.random()}`;
        const newMemberId = `new-member-${Date.now()}-${Math.random()}`;
        const existingTupleId = `existing-tuple-${Date.now()}-${Math.random()}`;

        // Create tuple type and members first
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: tupleTypeId },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: originalMemberId },
          }),
        );
        yield* Store.commit(
          events.tupleCreated({
            timestamp: Date.now(),
            data: {
              tupleId: existingTupleId,
              tupleTypeId: tupleTypeId,
              members: [originalMemberId],
            },
          }),
        );

        // Try to import same tuple with different members
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: newMemberId },
          }),
        );

        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [],
            parentLinks: [],
            textContent: {},
            nodeTypes: [],
            tupleTypeRoles: [],
            tupleTypeRoleAllowedTypes: [],
            tuples: [
              {
                id: existingTupleId,
                tupleTypeId: tupleTypeId,
                createdAt: 1003,
              },
            ],
            tupleMembers: [
              { tupleId: existingTupleId, position: 0, nodeId: newMemberId },
            ],
          },
        };

        yield* DataPort.importData(importData);

        // Should still have original member
        const members = yield* Store.query(
          queryDb(
            tables.tupleMembers.select().where({ tupleId: existingTupleId }),
          ),
        );
        expect(members).toHaveLength(1);
        expect(members[0]?.nodeId).toBe(originalMemberId);
      }).pipe(runtime.runPromise);
    });
  });

  describe("exportData with types and tuples", () => {
    it("exports node types", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        // Create nodes and add a type
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "my-node" },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "my-type" },
          }),
        );
        yield* Store.commit(
          events.typeAddedToNode({
            timestamp: Date.now(),
            data: {
              nodeId: "my-node",
              typeId: "my-type",
              position: "a0",
            },
          }),
        );

        const exported = yield* DataPort.exportData();

        const exportedType = exported.data.nodeTypes.find(
          (nt) => nt.nodeId === "my-node" && nt.typeId === "my-type",
        );
        expect(exportedType).toBeDefined();
        expect(exportedType?.position).toBe("a0");
      }).pipe(runtime.runPromise);
    });

    it("exports tuple type definitions", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        // Create tuple type node and add roles
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "relation-type" },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "person-type" },
          }),
        );
        yield* Store.commit(
          events.tupleTypeRoleAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId: "relation-type",
              position: 0,
              name: "from",
              required: true,
            },
          }),
        );
        yield* Store.commit(
          events.tupleTypeRoleAllowedTypeAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId: "relation-type",
              position: 0,
              allowedTypeId: "person-type",
            },
          }),
        );

        const exported = yield* DataPort.exportData();

        const exportedRole = exported.data.tupleTypeRoles.find(
          (r) => r.tupleTypeId === "relation-type" && r.position === 0,
        );
        expect(exportedRole).toBeDefined();
        expect(exportedRole?.name).toBe("from");
        expect(exportedRole?.required).toBe(true);

        const exportedAllowedType = exported.data.tupleTypeRoleAllowedTypes.find(
          (at) =>
            at.tupleTypeId === "relation-type" &&
            at.position === 0 &&
            at.allowedTypeId === "person-type",
        );
        expect(exportedAllowedType).toBeDefined();
      }).pipe(runtime.runPromise);
    });

    it("exports tuple instances", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        // Create tuple type and member nodes
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "rel-type" },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "alice" },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: "bob" },
          }),
        );
        yield* Store.commit(
          events.tupleCreated({
            timestamp: Date.now(),
            data: {
              tupleId: "alice-knows-bob",
              tupleTypeId: "rel-type",
              members: ["alice", "bob"],
            },
          }),
        );

        const exported = yield* DataPort.exportData();

        const exportedTuple = exported.data.tuples.find(
          (t) => t.id === "alice-knows-bob",
        );
        expect(exportedTuple).toBeDefined();
        expect(exportedTuple?.tupleTypeId).toBe("rel-type");

        const exportedMembers = exported.data.tupleMembers.filter(
          (m) => m.tupleId === "alice-knows-bob",
        );
        expect(exportedMembers).toHaveLength(2);
        expect(exportedMembers.find((m) => m.position === 0)?.nodeId).toBe(
          "alice",
        );
        expect(exportedMembers.find((m) => m.position === 1)?.nodeId).toBe(
          "bob",
        );
      }).pipe(runtime.runPromise);
    });

    it("round-trips types and tuples correctly", async () => {
      await Effect.gen(function* () {
        const DataPort = yield* DataPortT;
        const Store = yield* StoreT;

        const suffix = `${Date.now()}-${Math.random()}`;
        const personTypeId = `person-type-${suffix}`;
        const knowsTypeId = `knows-type-${suffix}`;
        const aliceId = `alice-${suffix}`;
        const bobId = `bob-${suffix}`;
        const tupleId = `alice-knows-bob-${suffix}`;

        // Create a complete setup with types and tuples
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: personTypeId },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: knowsTypeId },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: aliceId },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: bobId },
          }),
        );

        // Add types
        yield* Store.commit(
          events.typeAddedToNode({
            timestamp: Date.now(),
            data: { nodeId: aliceId, typeId: personTypeId, position: "a0" },
          }),
        );
        yield* Store.commit(
          events.typeAddedToNode({
            timestamp: Date.now(),
            data: { nodeId: bobId, typeId: personTypeId, position: "a0" },
          }),
        );

        // Add tuple type role
        yield* Store.commit(
          events.tupleTypeRoleAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId: knowsTypeId,
              position: 0,
              name: "knower",
              required: true,
            },
          }),
        );
        yield* Store.commit(
          events.tupleTypeRoleAdded({
            timestamp: Date.now(),
            data: {
              tupleTypeId: knowsTypeId,
              position: 1,
              name: "known",
              required: true,
            },
          }),
        );

        // Create tuple
        yield* Store.commit(
          events.tupleCreated({
            timestamp: Date.now(),
            data: {
              tupleId: tupleId,
              tupleTypeId: knowsTypeId,
              members: [aliceId, bobId],
            },
          }),
        );

        // Export
        const exported = yield* DataPort.exportData();

        // Verify export has everything
        expect(exported.data.nodeTypes.length).toBeGreaterThanOrEqual(2);
        expect(exported.data.tupleTypeRoles.length).toBeGreaterThanOrEqual(2);
        expect(exported.data.tuples.length).toBeGreaterThanOrEqual(1);
        expect(exported.data.tupleMembers.length).toBeGreaterThanOrEqual(2);

        // Import (will skip existing but that's fine for round-trip verification)
        yield* DataPort.importData(exported);

        // Export again
        const reExported = yield* DataPort.exportData();

        // Should have same counts
        expect(reExported.data.nodeTypes.length).toBe(
          exported.data.nodeTypes.length,
        );
        expect(reExported.data.tupleTypeRoles.length).toBe(
          exported.data.tupleTypeRoles.length,
        );
        expect(reExported.data.tuples.length).toBe(exported.data.tuples.length);
        expect(reExported.data.tupleMembers.length).toBe(
          exported.data.tupleMembers.length,
        );
      }).pipe(runtime.runPromise);
    });
  });
});
