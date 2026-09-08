import { Router } from "@solidjs/router";
import { ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { render } from "solid-js/web";
import { App } from "./App.tsx";
import { makeClient } from "./client.ts";
import "./index.css";

// The browser reaches entel through this origin under /api, where the dev
// server forwards to it, so the client is built on an absolute base and never
// needs to know where entel listens. The runtime is never disposed: the http
// client layer lives as long as the page, so a finalizer it may grow one day
// cannot run out from under the app at startup.
const runtime = ManagedRuntime.make(FetchHttpClient.layer);
const client = await runtime.runPromise(
  makeClient(new URL("/api", window.location.origin)),
);

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no element with id root");

render(
  () => (
    <Router>
      <App client={client} pollEvery="2 seconds" />
    </Router>
  ),
  root,
);
