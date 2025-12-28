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
