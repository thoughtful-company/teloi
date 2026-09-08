import {
  createMemoryHistory,
  MemoryRouter,
  type MemoryHistory,
} from "@solidjs/router";
import { render } from "@solidjs/testing-library";
import { Effect, type Scope } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { App } from "../App.tsx";
import { makeClient, type EntelClient } from "../client.ts";

export { EntelTest, WorkspaceStores } from "@teloi/entel/testing";

export interface Mounted {
  readonly client: EntelClient;
  readonly view: ReturnType<typeof render>;
  readonly history: MemoryHistory;
}

// Mounts the app on a path against the entel that the block's EntelTest layer
// started, through that layer's own HttpClient. Polls every few milliseconds
// so a test that waits for the next picture waits for almost nothing. Returns
// the same typed client so the test can model with it and then look. The
// router is wrapped here and not through render's `location` option, because
// that option imports the router from outside Vite, where Node meets the
// `solid` export condition and a .jsx file it cannot parse.
export const mount = Effect.fn("mount")(function* (
  path: string,
): Effect.fn.Return<Mounted, never, HttpClient.HttpClient | Scope.Scope> {
  const client = yield* makeClient();
  const history = createMemoryHistory();
  history.set({ value: path, scroll: false, replace: true });
  const view = render(() => (
    <MemoryRouter history={history}>
      <App client={client} pollEvery="20 millis" />
    </MemoryRouter>
  ));
  // Unmounted when the test's scope closes, so the poll fiber stops with the
  // test and not at the next test's cleanup, after the server it polls has
  // gone.
  yield* Effect.addFinalizer(() => Effect.sync(() => view.unmount()));
  return { client, view, history };
});

// jsdom keeps the document visible and has no tab to hide. The property is
// replaced on the document and the event the app listens for is dispatched,
// which is what a browser does when its tab is switched.
export const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};
