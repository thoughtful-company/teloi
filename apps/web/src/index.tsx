/* @refresh reload */
import { render } from "solid-js/web";

import App from "./App";
import { bootstrap } from "./bootstrap";
import { BrowserRuntimeContext } from "./context/browserRuntime";
import "./index.css";
import { runtime } from "./runtime";

const root = document.getElementById("root");

runtime.runPromise(bootstrap).then(() => {
  render(
    () => (
      <BrowserRuntimeContext.Provider value={runtime}>
        <App />
      </BrowserRuntimeContext.Provider>
    ),
    root!,
  );
});
