import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// The tests start entel in this process and render the app in jsdom, and the
// two want opposite things from one Node. vite-plugin-solid, in test mode, puts
// the `browser` export condition on every Vite environment so that Node loads
// Solid's browser build; vitest hands that condition to its workers as a Node
// flag. LiveStore's SQLite package also has a `browser` entry, listed before
// its `node` one, so under that flag Node picks the browser WASM loader for a
// server that runs on disk. The alias below points that one deep import at
// the Node loader, found from where entel's adapter would resolve it, and the
// adapter is inlined so the import passes through Vite and meets the alias.
const adapterNode = createRequire(
  new URL("../entel/package.json", import.meta.url),
).resolve("@livestore/adapter-node");
// By path from the package's main entry, not by resolving the subpath, since
// a resolve would follow the conditions of whichever process loads this
// config and could pick the browser file the alias exists to avoid.
const sqliteWasmForNode = resolve(
  dirname(createRequire(adapterNode).resolve("@livestore/sqlite-wasm")),
  "load-wasm/mod.node.js",
);

// Not merged with vite.config.ts on purpose. The tests need the Solid plugin
// and nothing else there: no Tailwind, since no test reads a style, and no
// proxy, since the client is pointed straight at the test server.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: [
      {
        find: "@livestore/sqlite-wasm/load-wasm",
        replacement: sqliteWasmForNode,
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    server: { deps: { inline: [/@livestore\/adapter-node/] } },
  },
});
