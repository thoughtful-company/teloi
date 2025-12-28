import "@/index.css";
import { tables } from "@/livestore/schema";
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
        const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "Child 1" }, { text: "Child 2" }],
        );

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
        const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root",
          [{ text: "First" }, { text: "Second" }, { text: "Third" }],
        );

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

    it("clears existing data before import", async () => {
      await Effect.gen(function* () {
        // Create some existing data
        const { nodeId: existingNodeId } = yield* Given.A_BUFFER_WITH_TEXT(
          "Existing content",
        );

        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const DataPort = yield* DataPortT;

        // Import new data
        const importData: ExportData = {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes: [{ id: "new-node", createdAt: 1000, modifiedAt: 1000 }],
            parentLinks: [],
            textContent: {
              "new-node": "New content",
            },
          },
        };

        yield* DataPort.importData(importData);

        // Old node should be gone
        const nodes = yield* Store.query(queryDb(tables.nodes.select()));
        const oldNode = nodes.find((n) => n.id === existingNodeId);
        expect(oldNode).toBeUndefined();

        // Old text should be cleared
        const oldText = Yjs.getText(existingNodeId).toString();
        expect(oldText).toBe("");

        // New node should exist
        const newNode = nodes.find((n) => n.id === "new-node");
        expect(newNode).toBeDefined();
      }).pipe(runtime.runPromise);
    });

    it("round-trips data correctly", async () => {
      await Effect.gen(function* () {
        // Create a complex tree structure
        const { rootNodeId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
          "Root node",
          [{ text: "Child 1" }, { text: "Child 2" }],
        );

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
  });
});
