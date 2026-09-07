import { Schema } from "effect";

// What a store was asked to do when it failed. A literal set rather than a
// string because a client branches on it: after "persist" the commit went
// through but the leader did not confirm it in time, so list before retrying;
// after "commit", "query" or "syncStatus" the store has shut down and every
// request against it fails until entel restarts; after "open" the store could
// not be booted and the next request tries again.
export const StoreOperation = Schema.Literals([
  "open",
  "commit",
  "syncStatus",
  "persist",
  "query",
]);
export type StoreOperation = typeof StoreOperation.Type;

// A LiveStore store is not answering. `store` is "registry" or a workspace id.
export class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()(
  "StoreUnavailable",
  { store: Schema.String, detail: StoreOperation },
  { httpApiStatus: 503 },
) {}
