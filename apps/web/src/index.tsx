/* @refresh reload */
import { Effect, Stream } from "effect";
import { render } from "solid-js/web";

import App from "./App";
import { bootstrap } from "./bootstrap";
import { BrowserRuntimeContext } from "./context/browserRuntime";
import "./index.css";
import { runtime } from "./runtime";
import { NavigationT } from "./services/ui/Navigation";

async function boot() {
  if (typeof SharedWorker === "undefined") {
    const { SharedWorkerPolyfill } = await import("@okikio/sharedworker");
    globalThis.SharedWorker =
      SharedWorkerPolyfill as unknown as typeof SharedWorker;
  }

  if ((window as any).electron?.platform === "darwin") {
    document.documentElement.classList.add("electron-mac");
  }

  const root = document.getElementById("root");

  await runtime.runPromise(bootstrap);

  // Page load triggers url sync
  runtime.runPromise(
    Effect.gen(function* () {
      const Navigation = yield* NavigationT;
      yield* Navigation.syncUrlToModel();
    }),
  );

  // Popstate listener for back/forward navigation
  runtime.runFork(
    Effect.gen(function* () {
      const Navigation = yield* NavigationT;
      const stream = yield* Navigation.startPopstateListener();
      yield* Stream.runDrain(stream);
    }),
  );

  render(
    () => (
      <BrowserRuntimeContext.Provider value={runtime}>
        <App />
      </BrowserRuntimeContext.Provider>
    ),
    root!,
  );
}

boot();
