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

export const tables = {
  nodes,
  parentLinks,
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

    const deleteNodesOps = allNodeIds.map((nodeId) =>
      tables.nodes.delete().where({ id: nodeId }),
    );

    return [...deleteParentLinksOps, ...deleteNodesOps];
  },
});

const state = State.SQLite.makeState({ tables, materializers });

export const schema = makeSchema({ events, state });
export type TeloiSchema = typeof schema;