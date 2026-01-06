import { makeSchema, SessionIdSymbol, State } from "@livestore/livestore";
import * as eventsDefs from "./events";

import { shouldNeverHappen } from "@/error";
import { Id } from "@/schema/id";
import { Model } from "@/schema/model";

const nodes = State.SQLite.table({
  name: "nodes",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    createdAt: State.SQLite.integer(),
    modifiedAt: State.SQLite.integer(),
  },
});

const parentLinks = State.SQLite.table({
  name: "parent_links",
  columns: {
    childId: State.SQLite.text({ primaryKey: true }),
    parentId: State.SQLite.text({ nullable: true }), // null for root nodes
    isHidden: State.SQLite.boolean({ default: false }),
    position: State.SQLite.text(), // fractional index key
    createdAt: State.SQLite.integer(),
  },
  indexes: [
    {
      name: "parentChild",
      columns: ["parentId", "position"],
      isUnique: false,
    },
  ],
});

const nodeTypes = State.SQLite.table({
  name: "node_types",
  columns: {
    nodeId: State.SQLite.text(),
    typeId: State.SQLite.text(),
    position: State.SQLite.text(),
    createdAt: State.SQLite.integer(),
  },
  indexes: [
    {
      name: "nodeTypes_nodeId",
      columns: ["nodeId", "position"],
      isUnique: false,
    },
    {
      name: "nodeTypes_typeId",
      columns: ["typeId"],
      isUnique: false,
    },
  ],
});

// Tuple system tables
const tupleTypeRoles = State.SQLite.table({
  name: "tuple_type_roles",
  columns: {
    tupleTypeId: State.SQLite.text(),
    position: State.SQLite.integer(),
    name: State.SQLite.text(),
    required: State.SQLite.boolean(),
    createdAt: State.SQLite.integer(),
  },
  indexes: [
    {
      name: "tupleTypeRoles_type_position",
      columns: ["tupleTypeId", "position"],
      isUnique: true,
    },
  ],
});

const tupleTypeRoleAllowedTypes = State.SQLite.table({
  name: "tuple_type_role_allowed_types",
  columns: {
    tupleTypeId: State.SQLite.text(),
    position: State.SQLite.integer(),
    allowedTypeId: State.SQLite.text(),
    createdAt: State.SQLite.integer(),
  },
  indexes: [
    {
      name: "tupleTypeRoleAllowedTypes_role",
      columns: ["tupleTypeId", "position"],
      isUnique: false,
    },
    {
      name: "tupleTypeRoleAllowedTypes_type",
      columns: ["allowedTypeId"],
      isUnique: false,
    },
  ],
});

const tuples = State.SQLite.table({
  name: "tuples",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    tupleTypeId: State.SQLite.text(),
    createdAt: State.SQLite.integer(),
  },
  indexes: [
    {
      name: "tuples_type",
      columns: ["tupleTypeId"],
      isUnique: false,
    },
  ],
});

const tupleMembers = State.SQLite.table({
  name: "tuple_members",
  columns: {
    tupleId: State.SQLite.text(),
    position: State.SQLite.integer(),
    nodeId: State.SQLite.text(),
  },
  indexes: [
    {
      name: "tupleMembers_tuple_position",
      columns: ["tupleId", "position"],
      isUnique: true,
    },
    {
      name: "tupleMembers_node",
      columns: ["nodeId"],
      isUnique: false,
    },
  ],
});

const window = State.SQLite.clientDocument({
  name: Model.DocumentName.Window,
  schema: Model.DocumentSchemas[Model.DocumentName.Window].schema,
  default: {
    id: SessionIdSymbol,
    value: {
      panes: [],
      activeElement: null,
    },
  },
});

const pane = State.SQLite.clientDocument({
  name: Model.DocumentName.Pane,
  schema: Model.DocumentSchemas[Model.DocumentName.Pane].schema,
  default: {
    id: SessionIdSymbol,
    value: null,
  },
});

const buffer = State.SQLite.clientDocument({
  name: Model.DocumentName.Buffer,
  schema: Model.DocumentSchemas[Model.DocumentName.Buffer].schema,
  default: {
    id: SessionIdSymbol,
    value: null,
  },
});

const block = State.SQLite.clientDocument({
  name: Model.DocumentName.Block,
  schema: Model.DocumentSchemas[Model.DocumentName.Block].schema,
  default: {
    id: SessionIdSymbol,
    value: null,
  },
});

const selection = State.SQLite.clientDocument({
  name: Model.DocumentName.Selection,
  schema: Model.DocumentSchemas[Model.DocumentName.Selection].schema,
  default: {
    id: SessionIdSymbol,
    value: null,
  },
});

// Create a mapping dictionary for the models with branded types
type ClientDocumentModels = {
  window: Model.Window | null;
  pane: Model.Pane | null;
  buffer: Model.EditorBuffer | null;
  block: Model.Block | null;
  selection: Model.Selection | null;
};

// Use the mapping
export type ClientDocumentModel<K extends Model.DocumentName> =
  ClientDocumentModels[K];

// Similarly for branded IDs
type ClientDocumentBrandedIds = {
  window: Id.Window;
  pane: Id.Pane;
  buffer: Id.Buffer;
  block: Id.Block;
  selection: Id.Window; // Selection uses WindowId as its key
};

export type BrandedId<K extends Model.DocumentName> =
  K extends keyof ClientDocumentBrandedIds
    ? ClientDocumentBrandedIds[K]
    : never;

export type EventFactory<K extends Model.DocumentName> = (
  value: ClientDocumentModel<K>,
  id?: BrandedId<K>,
) => unknown;

type EventsMap = {
  [K in Model.DocumentName]: EventFactory<K>;
};

export const documentEvents = {
  [Model.DocumentName.Window]: window.set,
  [Model.DocumentName.Pane]: pane.set,
  [Model.DocumentName.Buffer]: buffer.set,
  [Model.DocumentName.Selection]: selection.set,
  [Model.DocumentName.Block]: block.set,
} satisfies EventsMap;

export const events = {
  ...eventsDefs,
  ...documentEvents,
};

export type TeloiNode = State.SQLite.FromTable.RowDecoded<typeof nodes>;
export type ParentLink = State.SQLite.FromTable.RowDecoded<typeof parentLinks>;
export type NodeType = State.SQLite.FromTable.RowDecoded<typeof nodeTypes>;
export type TupleTypeRole = State.SQLite.FromTable.RowDecoded<
  typeof tupleTypeRoles
>;
export type TupleTypeRoleAllowedType = State.SQLite.FromTable.RowDecoded<
  typeof tupleTypeRoleAllowedTypes
>;
export type TupleRow = State.SQLite.FromTable.RowDecoded<typeof tuples>;
export type TupleMember = State.SQLite.FromTable.RowDecoded<
  typeof tupleMembers
>;

export const tables = {
  nodes,
  parentLinks,
  nodeTypes,
  tupleTypeRoles,
  tupleTypeRoleAllowedTypes,
  tuples,
  tupleMembers,
  window,
  pane,
  buffer,
  selection,
  block,
};

const materializers = State.SQLite.materializers(events, {
  "v1.NodeCreated": ({ timestamp, data }) => {
    const insertNodeOp = tables.nodes.insert({
      id: data.nodeId,
      createdAt: timestamp,
      modifiedAt: timestamp,
    });

    // Always create parent_links row (parentId is null for root nodes)
    const insertLinkOp = tables.parentLinks.insert({
      childId: data.nodeId,
      parentId: "parentId" in data ? (data.parentId ?? null) : null,
      position: "position" in data ? (data.position ?? "") : "",
      createdAt: timestamp,
    });

    return [insertNodeOp, insertLinkOp];
  },
  "v1.NodeMoved": ({ data }, ctx) => {
    const link = ctx.query(
      tables.parentLinks.select().where("childId", "=", data.nodeId).first(),
    );
    if (!link) {
      shouldNeverHappen("Parent link cannot be absent during materialization.");
    }

    if ("position" in data && data.position) {
      return parentLinks
        .update({
          parentId: data.newParentId,
          position: data.position,
          isHidden: data.isHidden,
        })
        .where({ childId: data.nodeId });
    } else {
      return parentLinks
        .update({
          parentId: null,
          position: "",
          isHidden: false,
        })
        .where({ childId: data.nodeId });
    }
  },
  // For node deletion soft delete should be considered
  // that moves a node to a special place and marks all
  // it's instances as hidden or dislpays [in_trash] icon
  // there
  "v1.NodeDeleted": ({ data }, ctx) => {
    /**
     * Collects all descendant node IDs for the given node.
     *
     * Recursively traverses child links and returns every descendant's `childId` (excluding the given `nodeId`) in depth-first pre-order: each direct child appears before its descendants.
     *
     * @param nodeId - The id of the node whose descendants should be collected
     * @returns An array of descendant node ids (may be empty)
     */
    function getAllDescendants(nodeId: string): string[] {
      const children = ctx.query(
        tables.parentLinks.select().where("parentId", "=", nodeId),
      );

      const descendants: string[] = [];
      for (const child of children) {
        descendants.push(child.childId);
        descendants.push(...getAllDescendants(child.childId));
      }

      return descendants;
    }

    const allDescendantIds = getAllDescendants(data.nodeId);

    const allNodeIds = [data.nodeId, ...allDescendantIds];

    const deleteParentLinksOps = allNodeIds.map((nodeId) =>
      tables.parentLinks.delete().where({ childId: nodeId }),
    );

    // Clean up type associations (both as node and as type)
    const deleteNodeTypesAsNodeOps = allNodeIds.map((nodeId) =>
      tables.nodeTypes.delete().where({ nodeId }),
    );
    const deleteNodeTypesAsTypeOps = allNodeIds.map((nodeId) =>
      tables.nodeTypes.delete().where({ typeId: nodeId }),
    );

    // Clean up tuples where deleted nodes appear as members
    const tupleIdsToDelete = new Set<string>();
    for (const nodeId of allNodeIds) {
      const memberships = ctx.query(
        tables.tupleMembers.select().where({ nodeId }),
      );
      for (const m of memberships) {
        tupleIdsToDelete.add(m.tupleId);
      }
    }
    const deleteTupleMembersOps = Array.from(tupleIdsToDelete).map((tupleId) =>
      tables.tupleMembers.delete().where({ tupleId }),
    );
    const deleteTuplesOps = Array.from(tupleIdsToDelete).map((tupleId) =>
      tables.tuples.delete().where({ id: tupleId }),
    );

    // Clean up tuple type definitions if a tuple type node is being deleted
    const deleteTupleTypeRolesOps = allNodeIds.map((nodeId) =>
      tables.tupleTypeRoles.delete().where({ tupleTypeId: nodeId }),
    );
    const deleteTupleTypeRoleAllowedTypesOps = allNodeIds.map((nodeId) =>
      tables.tupleTypeRoleAllowedTypes.delete().where({ tupleTypeId: nodeId }),
    );
    const deleteTupleTypeRoleAllowedTypesByAllowedTypeOps = allNodeIds.map(
      (nodeId) =>
        tables.tupleTypeRoleAllowedTypes.delete().where({ allowedTypeId: nodeId }),
    );

    const deleteNodesOps = allNodeIds.map((nodeId) =>
      tables.nodes.delete().where({ id: nodeId }),
    );

    return [
      ...deleteParentLinksOps,
      ...deleteNodeTypesAsNodeOps,
      ...deleteNodeTypesAsTypeOps,
      ...deleteTupleMembersOps,
      ...deleteTuplesOps,
      ...deleteTupleTypeRolesOps,
      ...deleteTupleTypeRoleAllowedTypesOps,
      ...deleteTupleTypeRoleAllowedTypesByAllowedTypeOps,
      ...deleteNodesOps,
    ];
  },
  "v1.TypeAddedToNode": ({ timestamp, data }) => {
    return tables.nodeTypes.insert({
      nodeId: data.nodeId,
      typeId: data.typeId,
      position: data.position,
      createdAt: timestamp,
    });
  },
  "v1.TypeRemovedFromNode": ({ data }) => {
    return tables.nodeTypes
      .delete()
      .where({ nodeId: data.nodeId, typeId: data.typeId });
  },
  // Tuple system materializers
  "v1.TupleTypeRoleAdded": ({ timestamp, data }) => {
    return tables.tupleTypeRoles.insert({
      tupleTypeId: data.tupleTypeId,
      position: data.position,
      name: data.name,
      required: data.required,
      createdAt: timestamp,
    });
  },
  "v1.TupleTypeRoleUpdated": ({ data }) => {
    return tables.tupleTypeRoles
      .update({ name: data.name, required: data.required })
      .where({ tupleTypeId: data.tupleTypeId, position: data.position });
  },
  "v1.TupleTypeRoleAllowedTypeAdded": ({ timestamp, data }) => {
    return tables.tupleTypeRoleAllowedTypes.insert({
      tupleTypeId: data.tupleTypeId,
      position: data.position,
      allowedTypeId: data.allowedTypeId,
      createdAt: timestamp,
    });
  },
  "v1.TupleCreated": ({ timestamp, data }) => {
    const insertTupleOp = tables.tuples.insert({
      id: data.tupleId,
      tupleTypeId: data.tupleTypeId,
      createdAt: timestamp,
    });

    const insertMemberOps = data.members.map((nodeId, position) =>
      tables.tupleMembers.insert({
        tupleId: data.tupleId,
        position,
        nodeId,
      }),
    );

    return [insertTupleOp, ...insertMemberOps];
  },
  "v1.TupleDeleted": ({ data }) => {
    const deleteMembersOp = tables.tupleMembers
      .delete()
      .where({ tupleId: data.tupleId });
    const deleteTupleOp = tables.tuples.delete().where({ id: data.tupleId });
    return [deleteMembersOp, deleteTupleOp];
  },
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
export type TeloiSchema = typeof schema;
