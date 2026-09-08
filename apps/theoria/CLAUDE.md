# apps/theoria

Theoria, the read-only view of a workspace model in entel. Package @teloi/theoria. Root rules are in the repo AGENTS.md. This file holds what only applies here.

## Commands

    pnpm -F @teloi/theoria test
    pnpm -F @teloi/theoria test src/pages/__tests__/Object.test.tsx
    pnpm -F @teloi/theoria typecheck
    pnpm -F @teloi/theoria build
    pnpm dev:theoria                  # dev server on localhost:3910, needs pnpm dev:entel beside it

Needs Node 24, because the tests start entel in this process and entel needs it.

## Rules

Effect v4, the same rc line as entel, pinned to the same version so the two packages share one copy of effect. Do not import from apps/web and do not copy its Effect idioms; that package is on Effect v3. The Catppuccin palette in src/theme.css is a copy of apps/web's for the same reason; the semantic tokens mapped on it are Theoria's own.

Read only. Nothing here sends anything but GET. The view is a window on what an agent does through the API, so a page must never hold a picture the server did not answer with.

The contract comes from `@teloi/entel/api` and the client from HttpApiClient.make over it. No hand-written URL, decoder or response type anywhere in src. A change to entel's contract fails this package's typecheck, and that is the point.

A page asks the server through createPolled in src/poll.ts and reads the answer as an Option. The picture is what the last request answered, the failure is what the last failed request said, and the two stay independent. Do not fetch in a page any other way.

Pages derive everything from the list endpoints. The object page reads Objects.list and finds its object in it, because the reverse relations, which tuples hold it as a place and which sets hold it as an element, are read off the other objects; src/model.ts has the pure functions for that.

Relative imports carry the .ts or .tsx extension, as in entel.

## Tests

The cleanup rule from the root docs/testing.md applies, nothing else in that file does. Tests live under `src/pages/__tests__`, named `*.test.tsx`, and run in Node under jsdom.

Every test block starts a real entel in this process through `EntelTest` from `@teloi/entel/testing`, an ephemeral port and a temp data directory that leave with the layer. The block passes `{ excludeTestServices: true }`, because entel's commit path polls its store on the real clock and the TestClock @effect/vitest installs would hang it. `mount(path)` in src/test/Theoria.tsx renders the app on a path under a memory router, against that entel, polling every 20 milliseconds, and returns the same typed client so the test models through it and then looks at the page. Wait with `findBy*` from testing-library, never with a sleep.

The vitest config has one override with a long comment. vite-plugin-solid puts the `browser` export condition on Node so that Node loads Solid's browser build, and LiveStore's SQLite package has a `browser` entry that then wins over its `node` one. The config aliases that one deep import to the Node loader and inlines entel's adapter so the import meets the alias. If a test dies with "both async and sync fetching of the wasm failed", that override stopped matching.

## Where things are described

- docs/architecture.md, how the package is put together: the client, the pages, polling, the theme, and why a new app rather than apps/web.
