import { Events, makeSchema, State } from "@livestore/livestore";
import { Schema } from "effect";
import { ObjectKind, PlacelessKind } from "../api/Objects.ts";
import { SignTitle } from "../api/Signs.ts";

// The inside of a workspace. Every workspace store has this schema and its
// own event log, so the schema knows nothing about which workspace it is in.
//
// Two levels. objects, places and elements are the ontological level, what
// the model says exists and how those things relate. signs is the semantic
// level, the tokens that name them. objects, signs and elements carry the
// global sequence number of the event that wrote the row, the order the log
// assigned, for the same reason as the registry's workspaces table. places
// does not; a place is ordered by its position in the tuple.

export const objects = State.SQLite.table({
  name: "objects",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    kind: State.SQLite.text({ schema: ObjectKind }),
    seq: State.SQLite.integer({}),
  },
});

export const signs = State.SQLite.table({
  name: "signs",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    objectId: State.SQLite.text({}),
    title: State.SQLite.text({}),
    seq: State.SQLite.integer({}),
  },
});

// A tuple's ordered places, one row per place. The pair of tuple and position
// is what identifies a place, so the pair, joined, is the row's key.
export const places = State.SQLite.table({
  name: "places",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    tupleId: State.SQLite.text({}),
    position: State.SQLite.integer({}),
    objectId: State.SQLite.text({}),
  },
  indexes: [{ name: "places_by_tuple", columns: ["tupleId"] }],
});

// Membership, one row per pair of set and element. The pair is the key for
// the same reason as in places, and a single key column is also the conflict
// target the materializer needs when the same membership is stated twice.
export const elements = State.SQLite.table({
  name: "elements",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    setId: State.SQLite.text({}),
    elementId: State.SQLite.text({}),
    seq: State.SQLite.integer({}),
  },
  indexes: [{ name: "elements_by_set", columns: ["setId"] }],
});

// nanoid never produces "/", so a joined pair cannot collide with another.
export const placeRowId = (tupleId: string, position: number): string =>
  `${tupleId}/${position}`;

export const elementRowId = (setId: string, elementId: string): string =>
  `${setId}/${elementId}`;

// Payload of v1.ObjectCreated. A union over the kind, mirroring CreateObject in
// the contract, so the rule that only a tuple has places, and at least one,
// holds for any committer and not only for the HTTP payload. The title
// carries its rule for the same reason.
export const ObjectCreated = Schema.Union([
  Schema.Struct({
    id: Schema.String,
    kind: PlacelessKind,
    places: Schema.optionalKey(Schema.Never),
    signId: Schema.String,
    title: SignTitle,
  }),
  Schema.Struct({
    id: Schema.String,
    kind: Schema.Literal("tuple"),
    places: Schema.NonEmptyArray(Schema.String),
    signId: Schema.String,
    title: SignTitle,
  }),
]);
export type ObjectCreated = typeof ObjectCreated.Type;

export const events = {
  // One event makes the object and its first sign, so no replay of the log
  // ever has an object without a name, not even between two events.
  objectCreated: Events.synced({
    name: "v1.ObjectCreated",
    schema: ObjectCreated,
  }),
  signCreated: Events.synced({
    name: "v2.SignCreated",
    schema: Schema.Struct({
      id: Schema.String,
      objectId: Schema.String,
      title: SignTitle,
    }),
  }),
  // The sign event from before objects existed. Nothing emits it any more,
  // but a store written then still replays it, and a log that stops replaying
  // is no longer an audit trail. Materialized as an individual object carrying
  // the sign, with the sign's id as the object's id.
  signCreatedV1: Events.synced({
    name: "v1.SignCreated",
    schema: Schema.Struct({ id: Schema.String, title: SignTitle }),
  }),
  elementAdded: Events.synced({
    name: "v1.ElementAdded",
    schema: Schema.Struct({ setId: Schema.String, elementId: Schema.String }),
  }),
};

export const schema = makeSchema({
  state: State.SQLite.makeState({
    tables: { objects, signs, places, elements },
    materializers: State.SQLite.materializers(events, {
      "v1.ObjectCreated": (created, { event }) => [
        objects.insert({
          id: created.id,
          kind: created.kind,
          seq: event.seqNum.global,
        }),
        signs.insert({
          id: created.signId,
          objectId: created.id,
          title: created.title,
          seq: event.seqNum.global,
        }),
        ...(created.kind === "tuple" ? created.places : []).map(
          (objectId, position) =>
            places.insert({
              id: placeRowId(created.id, position),
              tupleId: created.id,
              position,
              objectId,
            }),
        ),
      ],
      "v2.SignCreated": ({ id, objectId, title }, { event }) =>
        signs.insert({ id, objectId, title, seq: event.seqNum.global }),
      "v1.SignCreated": ({ id, title }, { event }) => [
        objects.insert({ id, kind: "individual", seq: event.seqNum.global }),
        signs.insert({ id, objectId: id, title, seq: event.seqNum.global }),
      ],
      // Two ElementAdded events for one pair can be in the log when two
      // requests raced past the service's check. Membership is a fact, so the
      // second one changes nothing rather than failing the materializer and
      // shutting the store down.
      "v1.ElementAdded": ({ setId, elementId }, { event }) =>
        elements
          .insert({
            id: elementRowId(setId, elementId),
            setId,
            elementId,
            seq: event.seqNum.global,
          })
          .onConflict("id", "ignore"),
    }),
  }),
  events,
});
