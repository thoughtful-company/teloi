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
        // 1. Get existing node IDs to check for conflicts
        const existingNodes = yield* Store.query(
          queryDb(tables.nodes.select()),
        );
        const existingNodeIds = new Set(existingNodes.map((n) => n.id));

        // Track which nodes we skip vs add
        const skippedNodeIds: string[] = [];
        const addedNodeIds: string[] = [];

        // 2. Create a map for quick lookup of parent links
        const parentLinkMap = new Map(
          data.data.parentLinks.map((l) => [l.childId, l]),
        );

        // 3. Identify root nodes (no parent link or parentId is null)
        const rootNodes = data.data.nodes.filter((n) => {
          const link = parentLinkMap.get(n.id);
          return !link || link.parentId === null;
        });

        // 4. Insert root nodes first (only if they don't exist)
        for (const node of rootNodes) {
          if (existingNodeIds.has(node.id)) {
            skippedNodeIds.push(node.id);
            continue;
          }
          yield* Store.commit(
            events.nodeCreated({
              timestamp: node.createdAt,
              data: { nodeId: node.id },
            }),
          );
          addedNodeIds.push(node.id);
        }

        // 5. Insert child nodes (only if they don't exist)
        for (const link of data.data.parentLinks) {
          if (link.parentId !== null) {
            if (existingNodeIds.has(link.childId)) {
              skippedNodeIds.push(link.childId);
              continue;
            }
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
            addedNodeIds.push(link.childId);
          }
        }

        // 6. Populate Yjs text content only for newly added nodes
        // Future: could optionally update text if modifiedAt is newer
        const addedNodeIdSet = new Set(addedNodeIds);
        for (const [nodeId, text] of Object.entries(data.data.textContent)) {
          if (!addedNodeIdSet.has(nodeId)) {
            continue;
          }
          const ytext = Yjs.getText(nodeId as Id.Node);
          ytext.insert(0, text);
        }

        // 7. Log import summary
        if (skippedNodeIds.length > 0) {
          console.warn(
            `Import: skipped ${skippedNodeIds.length} existing nodes:`,
            skippedNodeIds,
          );
        }
        console.log(
          `Import complete: added ${addedNodeIds.length} nodes, skipped ${skippedNodeIds.length}`,
        );
      });

    return {
      exportData,
      importData,
    };
  }),
);
