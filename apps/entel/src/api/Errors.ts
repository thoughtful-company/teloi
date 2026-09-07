import { Schema } from "effect";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

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

// Which part of the request failed its schema. "Body" and "ResponseHeaders"
// are the server failing to encode its own answer, a bug and not a client
// error, so they are not in this set; src/server/RequestSchema.ts answers
// them with an empty 500 and logs the failing path and rule.
export const RejectedPart = Schema.Literals([
  "Params",
  "Headers",
  "Query",
  "Payload",
]);
export type RejectedPart = typeof RejectedPart.Type;

// One thing wrong with the request, where and what. The path is the keys from
// the root of the part to the value, so ["title"] or ["places", "1"].
export class RequestIssue extends Schema.Class<RequestIssue>("RequestIssue")({
  path: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

// A request failed a schema rule before any handler ran. The framework answers
// that with an empty 400; this error is what entel answers instead, so a
// client learns which field and which rule. Declared on the api through the
// RequestSchema middleware, so it is in the OpenAPI document for every
// endpoint and in the typed client's error union.
export class RequestRejected extends Schema.TaggedError<RequestRejected>()(
  "RequestRejected",
  { part: RejectedPart, issues: Schema.Array(RequestIssue) },
  { httpApiStatus: 400 },
) {}

export class RequestSchema extends HttpApiMiddleware.Service<RequestSchema>()(
  "entel/RequestSchema",
  { error: RequestRejected },
) {}
