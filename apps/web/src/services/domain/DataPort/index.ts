import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { queryDb } from "@livestore/livestore";
import { Context, Effect, Layer } from "effect";
import { ExportData } from "./schema";

export type { ExportData } from "./schema";

export class DataPortT extends Context.Tag("DataPortT")<
  DataPortT,
  {
    exportData: () => Effect.Effect<ExportData>;
    importData: (data: ExportData) => Effect.Effect<void>;
  }
>() {}

export const DataPortLive = Layer.effect(
  DataPortT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Yjs = yield* YjsT;

    const exportData = (): Effect.Effect<ExportData> =>
      Effect.gen(function* () {
        // Query all nodes
        const nodes = yield* Store.query(queryDb(tables.nodes.select()));

        // Query all parent links
        const parentLinks = yield* Store.query(
          queryDb(tables.parentLinks.select()),
        );

        // Get text content for each node
        const textContent: Record<string, string> = {};
        for (const node of nodes) {
          const text = Yjs.getText(node.id as Id.Node).toString();
          if (text.length > 0) {
            textContent[node.id] = text;
          }
        }

        return {
          version: 1,
          exportedAt: Date.now(),
          data: { nodes, parentLinks, textContent },
        } satisfies ExportData;
      });

    const importData = (data: ExportData): Effect.Effect<void> =>
      Effect.gen(function* () {
        // 1. Get all existing nodes to clean up Yjs
        const existingNodes = yield* Store.query(
          queryDb(tables.nodes.select()),
        );

        // 2. Clear Yjs text for existing nodes
        for (const node of existingNodes) {
          Yjs.deleteText(node.id as Id.Node);
        }

        // 3. Find and delete root nodes (nodes without parents or with null parent)
        // The nodeDeleted event cascades to delete all descendants
        const existingLinks = yield* Store.query(
          queryDb(tables.parentLinks.select()),
        );
        const nodesWithParents = new Set(existingLinks.map((l) => l.childId));

        for (const node of existingNodes) {
          // If node has no parent link or has a null parent, it's a root
          const link = existingLinks.find((l) => l.childId === node.id);
          if (!nodesWithParents.has(node.id) || link?.parentId === null) {
            yield* Store.commit(
              events.nodeDeleted({
                timestamp: Date.now(),
                data: { nodeId: node.id },
              }),
            );
          }
        }

        // 4. Create a map for quick lookup of parent links
        const parentLinkMap = new Map(
          data.data.parentLinks.map((l) => [l.childId, l]),
        );

        // 5. Identify root nodes (no parent link or parentId is null)
        const rootNodes = data.data.nodes.filter((n) => {
          const link = parentLinkMap.get(n.id);
          return !link || link.parentId === null;
        });

        // 6. Insert root nodes first (without parent)
        for (const node of rootNodes) {
          yield* Store.commit(
            events.nodeCreated({
              timestamp: node.createdAt,
              data: { nodeId: node.id },
            }),
          );
        }

        // 7. Insert child nodes (with parent links)
        for (const link of data.data.parentLinks) {
          if (link.parentId !== null) {
            yield* Store.commit(
              events.nodeCreated({
                timestamp: link.createdAt,
                data: {
                  nodeId: link.childId,
                  parentId: link.parentId,
                  position: link.position,
                },
              }),
            );
          }
        }

        // 8. Populate Yjs text content
        for (const [nodeId, text] of Object.entries(data.data.textContent)) {
          const ytext = Yjs.getText(nodeId as Id.Node);
          ytext.insert(0, text);
        }
      });

    return {
      exportData,
      importData,
    };
  }),
);
