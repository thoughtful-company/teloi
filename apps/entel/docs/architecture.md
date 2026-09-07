# Architecture

How entel is put together today. The root AGENTS.md holds the vision. This file describes the code.

## Three layers

src/api is the contract. It holds the HttpApi groups, their endpoints, the schemas they exchange and the errors they can answer with. src/server implements the contract, one HttpApiBuilder.group per api group, plus the HTTP wiring. src/services holds the services the handlers call, each a Context.Service with a Live layer, and the LiveStore store behind them. src/services/Services.ts composes them into one ServicesLive, which main.ts and the tests both build. src/main.ts is the process entry point.

The contract is separate so the CLI can call HttpApiClient.make(Api) and get a typed client without pulling in server code. When the CLI exists, src/api moves into its own workspace package. Keeping the split inside apps/entel now makes that move a directory rename.

## Why HttpApi

Effect v4 offers two ways to serve HTTP. HttpRouter takes hand-written routes. HttpApi takes a declaration per endpoint, with schemas for params, payload, success and error, and derives the rest. entel's consumers are programs, the CLI and agents, so the derived parts are the point. One declaration yields a typed client and validation of every request and response at the boundary. The same declaration can produce an OpenAPI document once HttpApiBuilder.layer is given an openapiPath, which is not done yet. With plain routes each of those would be written and kept in sync by hand.

## Request flow

NodeHttpServer accepts the connection. HttpRouter.serve dispatches on method and path. HttpApiBuilder decodes the request against the endpoint schemas and runs the handler from src/server. The handler calls a service from src/services. The handler's result is encoded through the success schema and sent. HttpRouter.serve logs one line per request with method, path, status and duration, so handlers do not log requests themselves.

A request with a body that fails its schema is answered with 400 before any handler runs. The typed client checks the same schema before sending, so a well-typed caller never sees that 400. A workspace name is a trimmed string of 1 to 200 characters, checked by the same schema on both sides and again when the event is committed.

When the registry store is gone, every workspace endpoint answers 503 with a RegistryUnavailable error. LiveStore shuts a store down on its own when a commit fails to materialize, and nothing in entel reopens it, so the 503s last until the process restarts.

## State

Every change of state is a LiveStore event. A service commits the event to a store, LiveStore appends it to the event log and runs the materializer that updates the SQLite tables the service queries. The event log is the audit trail the vision asks for, and it can be replayed.

The registry is the one store entel owns itself. Its schema is in src/services/Registry.ts, a workspaces table and a v1.WorkspaceCreated event. The materializer stores the event's global sequence number with the row, so a list comes back in the order the log assigned. The Workspaces service in src/services/Workspaces.ts commits the event and reads the table. Ids are nanoids, generated in the service.

A commit returns as soon as the event is applied to the local tables. The leader writes it to disk afterwards and advances the upstream head past it when it has. create reads the local head right after its commit and polls the store's sync status every millisecond until the upstream head has caught up, with a ten second limit, so a 201 means the event is on disk. A process killed mid-request loses at most requests that were never answered. The status is polled because LiveStore's status stream is fed from one shared queue, and concurrent subscribers split its updates between them.

A commit whose materializer fails does not throw. LiveStore logs it and shuts the store down, and the local head does not move. create checks the head moved and answers 503 otherwise, so a failed commit never becomes a 201.

A create that waits out the ten seconds also answers 503, but by then the commit has happened and the store is healthy, so the workspace may show up in the next list. The RegistryUnavailable detail says which case it was, "persist" for this one, and a client should list before it retries.

The store lives on disk under ENTEL_DATA_DIR through @livestore/adapter-node with fs storage, one subdirectory per store. The adapter runs LiveStore's leader in the same thread as the HTTP handlers. That is a choice. LiveStore's makeWorkerAdapter moves the leader, and with it every SQLite write, to a worker thread, at the price of a worker file and message passing. With one store and small events the single thread is simpler, and the switch is one line in src/services/Registry.ts once leader work shows up in request latency. Opening the store is part of building the Registry layer and closing it is the layer's finalizer. LiveStore bounds the close, so a shutdown is orderly but not a guarantee that every pending event is written; the wait in create is what carries that guarantee.

LiveStore wants an OpenTelemetry tracer to hang its spans on. entel hands it the no-op tracer from @opentelemetry/api until it exports traces.

## Configuration

All keys come from the environment through Effect Config and carry the `ENTEL_` prefix.

| Key              | Default         | Meaning                                                                             |
| ---------------- | --------------- | ----------------------------------------------------------------------------------- |
| ENTEL_HOST       | 127.0.0.1       | Interface to bind. Loopback by default because nothing is authenticated yet         |
| ENTEL_PORT       | 3900            | TCP port to listen on                                                               |
| ENTEL_LOG_LEVEL  | Info            | Minimum log level, one of Effect's LogLevel names                                   |
| ENTEL_LOG_FORMAT | pretty          | pretty for a terminal, json for one JSON object per line                            |
| ENTEL_DATA_DIR   | apps/entel/data | Directory for LiveStore files. Relative paths resolve against the working directory |

## Logging

src/Logging.ts builds the logger layer from ENTEL_LOG_FORMAT and ENTEL_LOG_LEVEL. Service code logs wide events with Effect.annotateLogs, per the root docs/logging.md. The request line from HttpRouter.serve covers HTTP; service logs cover what happened inside. Reads log nothing of their own, the request line is enough. A command that committed an event logs one line at Info with the ids it produced, because the default level is Info and an operator watching entel should see the log grow. Debug is for transitions inside a command.

## Entry point

src/main.ts provides ServicesLive and NodeHttpServer.layerConfig to HttpLive, so host, port and data directory are read from config, and runs the result with Layer.launch under NodeRuntime.runMain. runMain handles SIGINT and SIGTERM by closing the server and running finalizers.

## Tests

Handlers are tested in memory. HttpApiTest.groups(Api, [...]) builds a typed client wired straight to the handler layers, using the same encoding, routing and decoding as a live server, so no socket is opened. The handler layers are given ServicesLive on a temp directory from src/test/DataDir.ts. The typed client cannot send a request its own schema rejects and does not expose the status code, so what needs those goes over a socket: `src/server/__tests__/health.test.ts` starts the real server on an ephemeral port through NodeHttpServer.layerTest, and `src/server/__tests__/workspaces.test.ts` has a socket block for the 201 and the server's own 400s.

Persistence has its own test in `src/services/__tests__/Workspaces.test.ts`. It builds and releases the service layer three times against one directory, so each run has to read what the previous one wrote.
