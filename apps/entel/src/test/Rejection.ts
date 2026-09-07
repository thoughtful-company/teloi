import { HttpClientResponse } from "effect/unstable/http";
import { RequestRejected } from "../api/Errors.ts";

// A 400 from any endpoint carries the same body, so every socket test that
// asserts one decodes it the same way. Decoded with the contract's error
// schema, so a 400 answering with anything else, an empty body included, does
// not pass.
export const rejection = (response: HttpClientResponse.HttpClientResponse) =>
  HttpClientResponse.schemaBodyJson(RequestRejected)(response);

// The issue paths on their own, as plain arrays, so a test can say which field
// broke a rule without spelling out the message the formatter chose.
export const issuePaths = (rejected: RequestRejected) =>
  rejected.issues.map((issue) => [...issue.path]);
