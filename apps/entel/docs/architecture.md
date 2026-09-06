# Architecture

How entel is put together today. The root AGENTS.md holds the vision. This file describes the code.

## Two halves

src/api is the contract. It holds the HttpApi groups, their endpoints and the schemas they exchange. src/server implements the contract, one HttpApiBuilder.group per api group, plus the HTTP wiring and the process entry point.

The contract is separate so the CLI can call HttpApiClient.make(Api) and get a typed client without pulling in server code. When the CLI exists, src/api moves into its own workspace package. Keeping the split inside apps/entel now makes that move a directory rename.

## Why HttpApi

Effect v4 offers two ways to serve HTTP. HttpRouter takes hand-written routes. HttpApi takes a declaration per endpoint, with schemas for params, payload, success and error, and derives the rest. entel's consumers are programs, the CLI and agents, so the derived parts are the point. One declaration yields a typed client and validation of every request and response at the boundary. The same declaration can produce an OpenAPI document once HttpApiBuilder.layer is given an openapiPath, which is not done yet. With plain routes each of those would be written and kept in sync by hand.

## Request flow

NodeHttpServer accepts the connection. HttpRouter.serve dispatches on method and path. HttpApiBuilder decodes the request against the endpoint schemas and runs the handler from src/server. The handler's result is encoded through the success schema and sent. HttpRouter.serve logs one line per request with method, path, status and duration, so handlers do not log requests themselves.

## Configuration

All keys come from the environment through Effect Config and carry the `ENTEL_` prefix.

| Key              | Default   | Meaning                                                                     |
| ---------------- | --------- | --------------------------------------------------------------------------- |
| ENTEL_HOST       | 127.0.0.1 | Interface to bind. Loopback by default because nothing is authenticated yet |
| ENTEL_PORT       | 3900      | TCP port to listen on                                                       |
| ENTEL_LOG_LEVEL  | Info      | Minimum log level, one of Effect's LogLevel names                           |
| ENTEL_LOG_FORMAT | pretty    | pretty for a terminal, json for one JSON object per line                    |

## Logging

src/Logging.ts builds the logger layer from ENTEL_LOG_FORMAT and ENTEL_LOG_LEVEL. Service code logs wide events with Effect.annotateLogs, per the root docs/logging.md. The request line from HttpRouter.serve covers HTTP; service logs cover what happened inside.

## Entry point

src/main.ts provides NodeHttpServer.layerConfig to HttpLive, so host and port are read from config, and runs the result with Layer.launch under NodeRuntime.runMain. runMain handles SIGINT and SIGTERM by closing the server and running finalizers.

## Tests

Handlers are tested in memory. HttpApiTest.groups(Api, [...]) builds a typed client wired straight to the handler layers, using the same encoding, routing and decoding as a live server, so no socket is opened. The Node wiring has one test of its own, in `src/server/__tests__/health.test.ts`, which starts the real server on an ephemeral port through NodeHttpServer.layerTest and fetches /health.
