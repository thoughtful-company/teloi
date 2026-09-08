import { Api } from "@teloi/entel/api";
import { HttpApiClient } from "effect/unstable/httpapi";

// The typed client over entel's contract. Every request and answer is encoded
// and decoded by the same schemas the server validates with, so a change to
// the contract fails this package's typecheck instead of a page at runtime.
export type EntelClient = HttpApiClient.ForApi<typeof Api>;

// Built once from whatever HttpClient is in context: the browser's fetch under
// /api in main.tsx, the test server's own client in a test.
export const makeClient = (baseUrl?: URL) =>
  HttpApiClient.make(Api, baseUrl === undefined ? {} : { baseUrl });
