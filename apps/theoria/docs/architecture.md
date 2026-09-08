# Architecture

How Theoria is put together today. The root AGENTS.md holds the vision. This file describes the code.

## Why a new app

Theoria exists so a person can watch an agent model through entel's API and judge the model as it takes shape. apps/web could have been that view, but it is on Effect v3 with a khora model of its own, and the typed client over entel's contract needs Effect v4. Waiting for the migration of apps/web (THC-145) would have put the agent experiment (THC-154) behind it. So Theoria is its own package on Effect v4, the same rc line as entel, and stays small: three pages, one client, no state of its own. Whether it folds into apps/web after the migration is an open question, and nothing here makes that harder.

## The client

entel exposes its contract as a package entry, `@teloi/entel/api`, which re-exports the HttpApi and every schema and error it exchanges and nothing from the server. src/client.ts builds the client with HttpApiClient.make over that api. Every request is encoded and every answer decoded by the same schemas the server validates with, and the client's methods carry the contract's error union in their types. When entel renames a field, adds a kind or changes an error, this package stops compiling.

In the browser, src/main.tsx builds the client on FetchHttpClient with the base URL `/api` on the page's own origin. The dev server forwards `/api` to entel on 127.0.0.1:3900, stripping the prefix, so no CORS header is needed and nothing in entel changes. Serving the built app from entel in production is not done and is its own issue.

In a test, the client is built on the HttpClient that entel's own test layer provides, pointed at an entel started in the test process. See Tests.

## Pages

Three routes under one shell, with @solidjs/router. The shell is a header with a link home. main.tsx wraps the routes in the browser router, the test harness in a memory router, so the pages are the same code in both.

The workspace list at `/` reads Workspaces.list and shows one row per workspace, the name as a link and the id beside it.

The workspace page at `/workspaces/:workspaceId` reads Workspaces.list for the name and Objects.list for the objects, and shows the objects grouped by kind, always all four kinds in the order individual, set, tuple, tuple set, each with its count. A kind with nothing in it says so, because a watcher wants to see that the agent has made no relations yet as much as what it has made.

The object page at `/workspaces/:workspaceId/objects/:objectId` reads Objects.list and finds its object in it. It shows the kind, the signs with the first title as heading, the places in order for a tuple, the elements for a set or tuple set, and where else the object appears: every tuple that holds it as a place, with the position, and every set that holds it as an element. That last section is why the page reads the whole list rather than Objects.get. entel stores places on the tuple and elements on the set, so the reverse relations are read off the other objects, in src/model.ts. Every object named anywhere is a link to its page. Ids are shown small and in a code element, because an agent talks in ids and a person needs to copy one to follow the agent.

A workspace the server does not have replaces the page with a sentence saying so, with the id, since there is nothing else to show. An object the workspace does not have shows the same kind of sentence under the workspace link. A request that fails for any other reason shows the error's tag in an alert beside the last good picture, which stays; see Polling.

## Polling

A page asks entel through createPolled in src/poll.ts, which runs the request now and again on a fixed schedule, two seconds in the browser, for as long as the tab is visible. The result is two Solid signals, the latest answer and the last failure, each an Option, created afresh for each request, so an answer that arrives late for a request the page has left can only land in signals nothing reads. A failed refresh leaves the last answer on the page and adds the failure beside it; the next good answer clears the failure.

Visibility is held by what exists, not by a flag. A visible tab has a fiber running the schedule; a hidden tab has none; showing the tab starts a new fiber, which asks at once. The request is read in a Solid tracking scope, so a route param it depends on is a dependency: navigating to another workspace clears the picture, interrupts the fiber and starts one for the new request.

Polling the list endpoints was chosen over server-sent events or LiveStore in the browser because it needs nothing from entel and is enough at the sizes the experiment has. When a workspace grows past what a two-second full list can carry, paging (THC-152) comes first and a push channel after.

## Theme

src/theme.css holds the Catppuccin palette, Latte by default and Mocha under `prefers-color-scheme: dark`, so the view follows the system without a switch. The palette is the one apps/web uses, copied rather than imported, because this package must not depend on one on another Effect major. The semantic tokens mapped on it are Theoria's own and fewer than the web app's, since one column of cards on a plain page needs no sidebar or pane surfaces. src/index.css maps them to Tailwind v4 theme variables, and the components use only those. Typography is the system font stack; ids are in the system monospace.

## Tests

The tests render the pages in jsdom against a real entel started in the same process. `EntelTest` from `@teloi/entel/testing` is entel's whole server on an ephemeral port with a temp data directory, plus an HttpClient pointed at it, as one layer. `mount(path)` in src/test/Theoria.tsx builds the typed client on that HttpClient, renders the app on the path under a memory router with a 20 millisecond poll, and returns the client, the render result and the history. A test models through the client and asserts on the page with testing-library queries. The layer keeps entel's services visible, so a test that needs entel to fail shuts the workspace's store down through WorkspaceStores, the way entel's own tests do, and reads the alert that the next poll produces. No mock stands anywhere between the page and the store. createPolled has two tests of its own under `src/__tests__`, over plain effects that die or fail until the test lets them succeed, which pin that a defect does not end the polling and that a later failure leaves the last answer beside the alert.

One override in vitest.config.ts makes that possible, and its comment says why: two packages in one Node process want opposite export conditions, and the alias there resolves the one import that goes wrong.
