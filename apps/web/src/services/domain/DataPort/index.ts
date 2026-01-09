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

        // Query type system
        const nodeTypes = yield* Store.query(
          queryDb(tables.nodeTypes.select()),
        );

        // Query tuple system
        const tupleTypeRoles = yield* Store.query(
          queryDb(tables.tupleTypeRoles.select()),
        );
        const tupleTypeRoleAllowedTypes = yield* Store.query(
          queryDb(tables.tupleTypeRoleAllowedTypes.select()),
        );
        const tuples = yield* Store.query(queryDb(tables.tuples.select()));
        const tupleMembers = yield* Store.query(
          queryDb(tables.tupleMembers.select()),
        );

        return {
          version: 1,
          exportedAt: Date.now(),
          data: {
            nodes,
            parentLinks,
            textContent,
            nodeTypes,
            tupleTypeRoles,
            tupleTypeRoleAllowedTypes,
            tuples,
            tupleMembers,
          },
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

        // 7. Import nodeTypes (skip existing)
        const existingNodeTypes = yield* Store.query(
          queryDb(tables.nodeTypes.select()),
        );
        const existingNodeTypeKeys = new Set(
          existingNodeTypes.map((nt) => `${nt.nodeId}|${nt.typeId}`),
        );

        let addedNodeTypesCount = 0;
        let skippedNodeTypesCount = 0;
        for (const nodeType of data.data.nodeTypes ?? []) {
          const key = `${nodeType.nodeId}|${nodeType.typeId}`;
          if (existingNodeTypeKeys.has(key)) {
            skippedNodeTypesCount++;
            continue;
          }
          yield* Store.commit(
            events.typeAddedToNode({
              timestamp: nodeType.createdAt,
              data: {
                nodeId: nodeType.nodeId,
                typeId: nodeType.typeId,
                position: nodeType.position,
              },
            }),
          );
          addedNodeTypesCount++;
        }

        // 8. Import tupleTypeRoles (skip existing)
        const existingRoles = yield* Store.query(
          queryDb(tables.tupleTypeRoles.select()),
        );
        const existingRoleKeys = new Set(
          existingRoles.map((r) => `${r.tupleTypeId}|${r.position}`),
        );

        let addedRolesCount = 0;
        let skippedRolesCount = 0;
        for (const role of data.data.tupleTypeRoles ?? []) {
          const key = `${role.tupleTypeId}|${role.position}`;
          if (existingRoleKeys.has(key)) {
            skippedRolesCount++;
            continue;
          }
          yield* Store.commit(
            events.tupleTypeRoleAdded({
              timestamp: role.createdAt,
              data: {
                tupleTypeId: role.tupleTypeId,
                position: role.position,
                name: role.name,
                required: role.required,
              },
            }),
          );
          addedRolesCount++;
        }

        // 9. Import tupleTypeRoleAllowedTypes (skip existing)
        const existingAllowedTypes = yield* Store.query(
          queryDb(tables.tupleTypeRoleAllowedTypes.select()),
        );
        const existingAllowedTypeKeys = new Set(
          existingAllowedTypes.map(
            (at) => `${at.tupleTypeId}|${at.position}|${at.allowedTypeId}`,
          ),
        );

        let addedAllowedTypesCount = 0;
        let skippedAllowedTypesCount = 0;
        for (const allowedType of data.data.tupleTypeRoleAllowedTypes ?? []) {
          const key = `${allowedType.tupleTypeId}|${allowedType.position}|${allowedType.allowedTypeId}`;
          if (existingAllowedTypeKeys.has(key)) {
            skippedAllowedTypesCount++;
            continue;
          }
          yield* Store.commit(
            events.tupleTypeRoleAllowedTypeAdded({
              timestamp: allowedType.createdAt,
              data: {
                tupleTypeId: allowedType.tupleTypeId,
                position: allowedType.position,
                allowedTypeId: allowedType.allowedTypeId,
              },
            }),
          );
          addedAllowedTypesCount++;
        }

        // 10. Import tuples (skip existing)
        const existingTuples = yield* Store.query(
          queryDb(tables.tuples.select()),
        );
        const existingTupleIds = new Set(existingTuples.map((t) => t.id));

        // Build map of tupleId -> ordered member nodeIds
        const tupleMembersMap = new Map<string, string[]>();
        for (const member of data.data.tupleMembers ?? []) {
          if (!tupleMembersMap.has(member.tupleId)) {
            tupleMembersMap.set(member.tupleId, []);
          }
          const members = tupleMembersMap.get(member.tupleId)!;
          members[member.position] = member.nodeId;
        }

        let addedTuplesCount = 0;
        let skippedTuplesCount = 0;
        for (const tuple of data.data.tuples ?? []) {
          if (existingTupleIds.has(tuple.id)) {
            skippedTuplesCount++;
            continue;
          }
          const members = tupleMembersMap.get(tuple.id) ?? [];
          yield* Store.commit(
            events.tupleCreated({
              timestamp: tuple.createdAt,
              data: {
                tupleId: tuple.id,
                tupleTypeId: tuple.tupleTypeId,
                members,
              },
            }),
          );
          addedTuplesCount++;
        }

        // 11. Log import summary
        if (skippedNodeIds.length > 0) {
          yield* Effect.logWarning(
            `Import: skipped ${skippedNodeIds.length} existing nodes`,
            { skippedNodeIds },
          );
        }
        yield* Effect.logInfo(
          `Import complete: added ${addedNodeIds.length} nodes, skipped ${skippedNodeIds.length}`,
        );
        yield* Effect.logInfo(
          `Import types: added ${addedNodeTypesCount}, skipped ${skippedNodeTypesCount}`,
        );
        yield* Effect.logInfo(
          `Import tuple roles: added ${addedRolesCount}, skipped ${skippedRolesCount}`,
        );
        yield* Effect.logInfo(
          `Import allowed types: added ${addedAllowedTypesCount}, skipped ${skippedAllowedTypesCount}`,
        );
        yield* Effect.logInfo(
          `Import tuples: added ${addedTuplesCount}, skipped ${skippedTuplesCount}`,
        );
      });

    return {
      exportData,
      importData,
    };
  }),
);
