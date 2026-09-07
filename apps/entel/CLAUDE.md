# apps/entel

Entelecheia, short entel, the server that runs Teloi workspaces. Package @teloi/entel. Root rules are in the repo AGENTS.md. This file holds what only applies here.

## Commands

    pnpm -F @teloi/entel test
    pnpm -F @teloi/entel test src/server/__tests__/health.test.ts
    pnpm -F @teloi/entel typecheck
    pnpm -F @teloi/entel start        # node src/main.ts, no build step
    pnpm dev:entel                    # same, restarts on file change

Needs Node 24 or later. Node runs the .ts sources itself, and the HTTP client library under platform-node needs 22.19 at least.

## Rules

Effect v4. This package is on effect 4.0.0-rc, the web app is on effect 3. Do not import from apps/web and do not copy its Effect idioms. The v4 typings are the source of truth. Read apps/entel/node_modules/effect/AGENTS.md and the examples under apps/entel/node_modules/effect/ai-docs/src before writing Effect code here. Services extend Context.Service, errors extend Schema.TaggedError, HTTP modules come from effect/unstable/http and effect/unstable/httpapi.

Relative imports carry the .ts extension. Node runs the sources directly and does not resolve extensionless imports.

src/api is the contract and never imports from src/server. The CLI will import the contract to derive a typed client, so nothing server-side may leak into it.

Every endpoint is declared in an HttpApiGroup under src/api and implemented with HttpApiBuilder.group under src/server. No hand-written HttpRouter routes.

Handlers hold no state and no logic beyond decoding a request into a service call. Services live in src/services as Context.Service classes with a Live layer, composed once in src/services/Services.ts. State goes through LiveStore, on the 0.5 dev line because that is the one that peers on Effect v4. Every change of state is an event committed to a store, never a direct table write. Errors a caller can receive are Schema.TaggedError classes declared in src/api next to the endpoints that answer with them.

Config comes from the environment through Effect Config, keys prefixed `ENTEL_`. Never read process.env directly.

## Tests

The cleanup rule from the root docs/testing.md applies, nothing else in that file does. Tests live next to the code in `__tests__` folders, named `*.test.ts`.

Handlers are tested in memory through HttpApiTest.groups, which runs the real request pipeline against the handler layers without a socket. A socket block through NodeHttpServer.layerTest exists for what the typed client cannot produce, a payload its own schema rejects or the status code of a response. `src/server/__tests__/health.test.ts` has the one that pins the Node wiring itself.

Tests run against the real services and a real store. src/test/DataDir.ts points ENTEL_DATA_DIR at a temp directory scoped to the layer, so each `layer(...)` block gets its own store and loses it on teardown. A store persists across restarts, so a `layer(...)` block shares one store between its tests and no test may assume the registry starts empty.

A `layer(...)` block whose tests commit to the store passes `{ excludeTestServices: true }`. The service polls the store on the real clock until the leader has the event, and under @effect/vitest's TestClock that poll never ticks.

## Where things are described

- docs/architecture.md, how the package is put together: the api and server split, why HttpApi, request flow, config, logging, entry point.
