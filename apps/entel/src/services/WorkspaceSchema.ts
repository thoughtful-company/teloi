import { Events, makeSchema, State } from "@livestore/livestore";
import { Schema } from "effect";
import { SignTitle } from "../api/Signs.ts";

// The inside of a workspace. Every workspace store has this schema and its
// own event log, so the schema knows nothing about which workspace it is in.

export const signs = State.SQLite.table({
  name: "signs",
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    title: State.SQLite.text({}),
    // Global sequence number of the creating event, the order the log
    // assigned. Same reason as the registry's workspaces table.
    seq: State.SQLite.integer({}),
  },
});

export const events = {
  signCreated: Events.synced({
    name: "v1.SignCreated",
    // The event carries the domain rule for the title, so a bad title cannot
    // be committed even by a caller that bypasses the HTTP payload schema.
    schema: Schema.Struct({ id: Schema.String, title: SignTitle }),
  }),
};

export const schema = makeSchema({
  state: State.SQLite.makeState({
    tables: { signs },
    materializers: State.SQLite.materializers(events, {
      "v1.SignCreated": ({ id, title }, { event }) =>
        signs.insert({ id, title, seq: event.seqNum.global }),
    }),
  }),
  events,
});
