import { Effect, SchemaIssue } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { HttpApiMiddleware } from "effect/unstable/httpapi";
import { RequestIssue, RequestRejected, RequestSchema } from "../api/Errors.ts";

// The framework answers a schema failure with an empty 400 and keeps the
// reason for the log. This turns it into RequestRejected, a declared error the
// builder encodes as JSON, so the caller sees which field broke which rule.
// The two kinds that mean the server failed to encode its own answer are a
// bug in entel, not a bad request, so they answer 500 and log the failing
// path and rule as an error; the framework's empty 400 would blame the caller
// and break the contract's promise that every 400 carries a RequestRejected
// body.
export const RequestSchemaLive = HttpApiMiddleware.layerSchemaErrorTransform(
  RequestSchema,
  (error, context) => {
    const issues = format(error.cause.issue).issues.map(
      (issue) =>
        new RequestIssue({
          path: (issue.path ?? []).map(segmentName),
          message: issue.message,
        }),
    );
    // Both lines name the endpoint themselves. The request line logged by
    // HttpRouter.serve is a separate record, and once logs are shipped and
    // interleaved the two share nothing but a fiber id.
    const where = {
      group: context.group.identifier,
      endpoint: context.endpoint.identifier,
    };
    if (error.kind === "Body" || error.kind === "ResponseHeaders") {
      return Effect.logError(
        "[RequestSchema] response failed its own schema",
      ).pipe(
        Effect.annotateLogs({
          ...where,
          kind: error.kind,
          issues: lines(issues),
        }),
        Effect.as(HttpServerResponse.empty({ status: 500 })),
      );
    }
    const rejected = new RequestRejected({ part: error.kind, issues });
    // The framework's own answer logged the reason; now that the reason goes
    // to the caller, an operator watching a failing client still needs it.
    return Effect.logInfo("[RequestSchema] request rejected").pipe(
      Effect.annotateLogs({
        ...where,
        part: rejected.part,
        issues: lines(issues),
      }),
      Effect.andThen(Effect.fail(rejected)),
    );
  },
);

// ================================ Internal ===================================

// Flattens the issue tree into one entry per leaf with its path, the same
// shape Standard Schema clients already read.
const format = SchemaIssue.makeFormatterStandardSchemaV1();

const segmentName = (segment: PropertyKey | { readonly key: PropertyKey }) =>
  String(typeof segment === "object" ? segment.key : segment);

// Strings rather than the issue tree, because the json format would print
// the tree with its AST, and an encode issue carries no input value anyway.
const lines = (issues: ReadonlyArray<RequestIssue>) =>
  issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
