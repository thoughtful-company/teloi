/* @refresh reload */
import { Effect, Stream } from "effect";
import { render } from "solid-js/web";

import App from "./App";
import { bootstrap } from "./bootstrap";
import { BrowserRuntimeContext } from "./context/browserRuntime";
import "./index.css";
import { runtime } from "./runtime";
import { NavigationT } from "./services/ui/Navigation";

const root = document.getElementById("root");

runtime.runPromise(bootstrap).then((fallbackNodeId) => {
  // Page load triggers url sync
  runtime.runPromise(
    Effect.gen(function* () {
      const Navigation = yield* NavigationT;
      yield* Navigation.syncUrlToModel(fallbackNodeId);
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
});
