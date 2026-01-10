import { EventDef, Events, Schema, State } from "@livestore/livestore";

export type ToSQLiteEventDef<T> =
  T extends EventDef<infer Name, infer Args, infer Result>
    ? State.SQLite.EventDef<Name, Args, Result>
    : never;

export type ExtractEventArgs<T> =
  T extends EventDef<string, infer Args, unknown> ? Args : never;

export type NodeCreated = typeof nodeCreated;

export const nodeCreated = Events.synced({
  name: "v1.NodeCreated",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Union(
      Schema.Struct({
        nodeId: Schema.String,
        parentId: Schema.optional(Schema.String),
        position: Schema.optional(Schema.String),
      }),
      Schema.Struct({
        nodeId: Schema.String,
      }),
    ),
  }),
});

export const nodeMoved = Events.synced({
  name: "v1.NodeMoved",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Union(
      Schema.Struct({
        nodeId: Schema.String,
        newParentId: Schema.String,
        position: Schema.String,
        isHidden: Schema.optionalWith(Schema.Boolean, { default: () => false }),
      }),
      Schema.Struct({
        nodeId: Schema.String,
        newParentId: Schema.Undefined,
        position: Schema.Undefined,
      }),
    ),
  }),
});

export type NodeMoved = typeof nodeMoved;

export const nodeDeleted = Events.synced({
  name: "v1.NodeDeleted",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      nodeId: Schema.String,
    }),
  }),
});

export type NodeDeleted = typeof nodeDeleted;

export const typeAddedToNode = Events.synced({
  name: "v1.TypeAddedToNode",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      nodeId: Schema.String,
      typeId: Schema.String,
      position: Schema.String,
    }),
  }),
});

export type TypeAddedToNode = typeof typeAddedToNode;

export const typeRemovedFromNode = Events.synced({
  name: "v1.TypeRemovedFromNode",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      nodeId: Schema.String,
      typeId: Schema.String,
    }),
  }),
});

// Tuple system events
export const tupleTypeRoleAdded = Events.synced({
  name: "v1.TupleTypeRoleAdded",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      tupleTypeId: Schema.String,
      position: Schema.Number,
      name: Schema.String,
      required: Schema.Boolean,
    }),
  }),
});

export type TupleTypeRoleAdded = typeof tupleTypeRoleAdded;

export const tupleTypeRoleUpdated = Events.synced({
  name: "v1.TupleTypeRoleUpdated",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      tupleTypeId: Schema.String,
      position: Schema.Number,
      name: Schema.String,
      required: Schema.Boolean,
    }),
  }),
});

export type TupleTypeRoleUpdated = typeof tupleTypeRoleUpdated;

export const tupleTypeRoleAllowedTypeAdded = Events.synced({
  name: "v1.TupleTypeRoleAllowedTypeAdded",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      tupleTypeId: Schema.String,
      position: Schema.Number,
      allowedTypeId: Schema.String,
    }),
  }),
});

export type TupleTypeRoleAllowedTypeAdded =
  typeof tupleTypeRoleAllowedTypeAdded;

export const tupleCreated = Events.synced({
  name: "v1.TupleCreated",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      tupleId: Schema.String,
      tupleTypeId: Schema.String,
      members: Schema.Array(Schema.String),
    }),
  }),
});

export type TupleCreated = typeof tupleCreated;

export const tupleDeleted = Events.synced({
  name: "v1.TupleDeleted",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      tupleId: Schema.String,
    }),
  }),
});

export type TupleDeleted = typeof tupleDeleted;

// Batch node reordering event for smooth multi-block animations
export const nodesReordered = Events.synced({
  name: "v1.NodesReordered",
  schema: Schema.Struct({
    timestamp: Schema.Number,
    data: Schema.Struct({
      moves: Schema.Array(
        Schema.Struct({
          nodeId: Schema.String,
          newParentId: Schema.String,
          position: Schema.String,
        }),
      ),
    }),
  }),
});

export type NodesReordered = typeof nodesReordered;
