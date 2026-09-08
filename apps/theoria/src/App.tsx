import { A, Route } from "@solidjs/router";
import type { Duration } from "effect";
import type { Component, ParentProps } from "solid-js";
import type { EntelClient } from "./client.ts";
import { ObjectPage } from "./pages/Object.tsx";
import { WorkspacePage } from "./pages/Workspace.tsx";
import { WorkspacesPage } from "./pages/Workspaces.tsx";

export interface AppProps {
  readonly client: EntelClient;
  // How long a page waits between one picture and the next while the tab is
  // visible. Two seconds in the browser, a few milliseconds in a test.
  readonly pollEvery: Duration.Input;
}

// The routes. The caller wraps them in a Router, the browser's in main.tsx and
// a memory router in a test, so the pages are the same in both.
export const App = (props: AppProps) => {
  const page = (Page: Component<AppProps>) => () => <Page {...props} />;
  return (
    <Route path="/" component={Shell}>
      <Route path="/" component={page(WorkspacesPage)} />
      <Route path="/workspaces/:workspaceId" component={page(WorkspacePage)} />
      <Route
        path="/workspaces/:workspaceId/objects/:objectId"
        component={page(ObjectPage)}
      />
    </Route>
  );
};

// ================================ Internal ===================================

const Shell: Component<ParentProps> = (props) => (
  <div class="mx-auto max-w-3xl px-6 py-8">
    <header class="mb-10 text-sm text-text-tertiary">
      <A href="/" class="hover:text-text-primary">
        Theoria
      </A>
    </header>
    <main>{props.children}</main>
  </div>
);
