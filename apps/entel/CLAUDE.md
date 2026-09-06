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

Config comes from the environment through Effect Config, keys prefixed `ENTEL_`. Never read process.env directly.

## Tests

The cleanup rule from the root docs/testing.md applies, nothing else in that file does. Tests live next to the code in `__tests__` folders, named `*.test.ts`.

Handlers are tested in memory through HttpApiTest.groups, which runs the real request pipeline against the handler layers without a socket. The Node wiring is tested once, in `src/server/__tests__/health.test.ts`, through NodeHttpServer.layerTest.

## Where things are described

- docs/architecture.md, how the package is put together: the api and server split, why HttpApi, request flow, config, logging, entry point.
