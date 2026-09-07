# Architecture

How entel is put together today. The root AGENTS.md holds the vision. This file describes the code.

## Three layers

src/api is the contract. It holds the HttpApi groups, their endpoints, the schemas they exchange and the errors they can answer with. src/server implements the contract, one HttpApiBuilder.group per api group, plus the HTTP wiring. src/services holds the services the handlers call, each a Context.Service with a Live layer, and the LiveStore store behind them. src/services/Services.ts composes them into one ServicesLive, which main.ts and the tests both build. src/main.ts is the process entry point.

The contract is separate so the CLI can call HttpApiClient.make(Api) and get a typed client without pulling in server code. When the CLI exists, src/api moves into its own workspace package. Keeping the split inside apps/entel now makes that move a directory rename.

## Why HttpApi

Effect v4 offers two ways to serve HTTP. HttpRouter takes hand-written routes. HttpApi takes a declaration per endpoint, with schemas for params, payload, success and error, and derives the rest. entel's consumers are programs, the CLI and agents, so the derived parts are the point. One declaration yields a typed client and validation of every request and response at the boundary. The same declaration can produce an OpenAPI document once HttpApiBuilder.layer is given an openapiPath, which is not done yet. With plain routes each of those would be written and kept in sync by hand.

## Request flow

NodeHttpServer accepts the connection. HttpRouter.serve dispatches on method and path. HttpApiBuilder decodes the request against the endpoint schemas and runs the handler from src/server. The handler calls a service from src/services. The handler's result is encoded through the success schema and sent. HttpRouter.serve logs one line per request with method, path, status and duration, so handlers do not log requests themselves.

A request with a body that fails its schema is answered with 400 before any handler runs. The typed client checks the same schema before sending, so a well-typed caller never sees that 400. A workspace name and a sign title are trimmed strings of 1 to 200 characters, one rule in src/api/Text.ts, checked on both sides and again when the event is committed.

A path that names a workspace the registry does not know answers 404 with a WorkspaceNotFound error, before any store for it is touched.

GET /signs reads across every workspace. It answers rows of workspace id and sign, in workspace creation order and then sign creation order, and one unavailable store fails the whole read with a 503 naming that store. A list with a hole in it would read as a workspace with no signs, and no client can tell the two apart.

When a store is gone, every endpoint that needs it answers 503 with a StoreUnavailable error naming the store, "registry" or the workspace id. LiveStore shuts a store down on its own when a commit fails to materialize, and nothing in entel reopens it, so the 503s last until the process restarts.

## State

Every change of state is a LiveStore event. A service commits the event to a store, LiveStore appends it to the event log and runs the materializer that updates the SQLite tables the service queries. The event log is the audit trail the vision asks for, and it can be replayed.

There are two kinds of store. The registry is the one store entel owns itself. Its schema is in src/services/Registry.ts, a workspaces table and a v1.WorkspaceCreated event. Every workspace then has a store of its own, with the workspace id as the store id and the schema in src/services/WorkspaceSchema.ts, today a signs table and a v1.SignCreated event. Both materializers store the event's global sequence number with the row, so a list comes back in the order the log assigned. Ids are nanoids, generated in the services.

One store per workspace is the shape that keeps workspaces isolated. Each has its own event log and SQLite file, so a workspace can later be synced or shared without shipping any other, and a corrupt log takes down one workspace. The cost is that no SQL query spans two workspaces. A read across workspaces is Signs.listAll in src/services/Signs.ts over WorkspaceStores.openAll, which asks the registry once for every workspace in creation order and opens their stores concurrently, so no id is checked twice. listAll runs the per-workspace list query on each and concatenates in that order. The read is not a snapshot; each store is queried at its own moment, so a sign committed while the read runs may or may not be in the answer. The first read after a restart boots every store, and if one of them fails the read waits for the boots already running before it answers 503, because a boot cannot be interrupted. Measured on one laptop with three signs per workspace, that first read took 114 ms for 30 workspaces and 340 ms for 100, about 3.4 ms per store, and the warm read 2 ms and 5 ms. An index over all workspaces, a read model fed by every store's events, is the step after this one and only starts when the fan-out is measured slow. A reference from one workspace into another is a pair of workspace id and object id, the shape GET /signs answers in; nothing enforces that the target exists.

src/services/WorkspaceStores.ts opens workspace stores. open(workspaceId) first asks the registry whether the id exists and fails with WorkspaceNotFound otherwise, before anything else happens. That check is also what keeps a request from naming an arbitrary directory, because the id becomes the store's directory name under ENTEL_DATA_DIR. Known ids go through createStore inside an RcMap keyed by workspace id with an infinite idle time, so concurrent opens of one workspace share one boot and a store once opened stays open until the layer is torn down, which closes them all. RcMap keeps a failed lookup under an infinite idle time, so a failed boot invalidates its own key from inside the lookup, once, and the next call boots again. That invalidate needs a waiter still holding the entry, or it would close the entry's scope from inside the fiber running in it and hang, so open's get is uninterruptible: a request dropped mid-boot keeps its hold until the boot ends. Each open releases its reference as soon as it returns, which is safe only because nothing is ever released under an infinite idle time and no capacity. A read opens a store as much as a write does, so a workspace's directory appears at its first list or create, and a directory on disk says nothing about whether the workspace has content. open returns the store together with its StoreCalls, so a service gets the commit and error path along with the store. The Signs service in src/services/Signs.ts opens the workspace in the path and works on it. The Workspaces service works on the registry.

Nothing bounds the number of open stores. Each one holds a LiveStore leader, a SQLite connection and file handles, so a process that touches thousands of workspaces reaches the file descriptor limit before anything in entel reports a problem, and a read across workspaces opens all of them at once. RcMap has a capacity and a finite idle time for exactly that; THC-149 sets them. Setting either also means open must hold its reference for the caller's scope, since a store could then be released between open and commit.

Every call into a store goes through makeStoreCalls in src/services/StoreCalls.ts, bound to one store and the name it reports, "registry" or the workspace id. A commit returns as soon as the event is applied to the local tables. The leader writes it to disk afterwards and advances the upstream head past it when it has. commit reads the local head right after the store's commit and polls the store's sync status every millisecond until the upstream head has caught up, with a ten second limit, so a 201 means the event is on disk. A process killed mid-request loses at most requests that were never answered. The status is polled because LiveStore's status stream is fed from one shared queue, and concurrent subscribers split its updates between them.

A commit whose materializer fails does not throw. LiveStore logs it and shuts the store down, and the local head does not move. commit checks the head moved and fails otherwise, so a failed commit never becomes a 201.

A create that waits out the ten seconds also answers 503, but by then the commit has happened and the store is healthy, so the record may show up in the next list. The StoreUnavailable detail says which case it was, "persist" for this one, and a client should list before it retries. Detail "open" means a workspace store failed to boot.

All stores live on disk under ENTEL_DATA_DIR through one @livestore/adapter-node fs adapter built in src/services/StoreAdapter.ts, one subdirectory per store id. The adapter runs LiveStore's leader in the same thread as the HTTP handlers. That is a choice. LiveStore's makeWorkerAdapter moves the leader, and with it every SQLite write, to a worker thread, at the price of a worker file and message passing. With small events the single thread is simpler, and the switch is one line in StoreAdapter.ts once leader work shows up in request latency. Opening the registry is part of building its layer and closing it is the layer's finalizer; workspace stores open on first use and close with the WorkspaceStores layer. LiveStore bounds the close, so a shutdown is orderly but not a guarantee that every pending event is written; the wait in commit is what carries that guarantee.

LiveStore wants an OpenTelemetry tracer to hang its spans on. entel hands it the no-op tracer from @opentelemetry/api until it exports traces.

## Configuration

All keys come from the environment through Effect Config and carry the `ENTEL_` prefix.

| Key              | Default         | Meaning                                                                                                         |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| ENTEL_HOST       | 127.0.0.1       | Interface to bind. Loopback by default because nothing is authenticated yet                                     |
| ENTEL_PORT       | 3900            | TCP port to listen on                                                                                           |
| ENTEL_LOG_LEVEL  | Info            | Minimum log level, one of Effect's LogLevel names                                                               |
| ENTEL_LOG_FORMAT | pretty          | pretty for a terminal, json for one JSON object per line                                                        |
| ENTEL_DATA_DIR   | apps/entel/data | Directory for LiveStore files, one subdirectory per store. Relative paths resolve against the working directory |

## Logging

src/Logging.ts builds the logger layer from ENTEL_LOG_FORMAT and ENTEL_LOG_LEVEL. Service code logs wide events with Effect.annotateLogs, per the root docs/logging.md. The request line from HttpRouter.serve covers HTTP; service logs cover what happened inside. Reads log nothing of their own, the request line is enough. A command that committed an event logs one line at Info with the ids it produced, because the default level is Info and an operator watching entel should see the log grow. Debug is for transitions inside a command.

## Entry point

src/main.ts provides ServicesLive and NodeHttpServer.layerConfig to HttpLive, so host, port and data directory are read from config, and runs the result with Layer.launch under NodeRuntime.runMain. runMain handles SIGINT and SIGTERM by closing the server and running finalizers.

## Tests

Handlers are tested in memory. HttpApiTest.groups(Api, [...]) builds a typed client wired straight to the handler layers, using the same encoding, routing and decoding as a live server, so no socket is opened. The handler layers are given ServicesLive on a temp directory from src/test/DataDir.ts. The typed client cannot send a request its own schema rejects and does not expose the status code, so what needs those goes over a socket: `src/server/__tests__/health.test.ts` starts the real server on an ephemeral port through NodeHttpServer.layerTest, and `src/server/__tests__/workspaces.test.ts` and `src/server/__tests__/signs.test.ts` have socket blocks for the 201, the server's own 400s, the 404 for an unknown workspace and the 503 with the store named.

Persistence has its own tests in `src/services/__tests__/Workspaces.test.ts` and `src/services/__tests__/Signs.test.ts`. They build and release the service layer three times against one directory, so each run has to read what the previous one wrote. The signs test also pins isolation, a sign in one workspace never shows in another and only that workspace's directory appears on disk, and the read across workspaces: its order, that an empty workspace contributes no row, that it opens stores itself after a restart, and that a shut-down store fails it naming that workspace.
