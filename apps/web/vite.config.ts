import tailwindcss from "@tailwindcss/vite";
import mkcert from "vite-plugin-mkcert";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import solidPlugin from "vite-plugin-solid";
import topLevelAwait from "vite-plugin-top-level-await";
import viteTsconfigPaths from "vite-tsconfig-paths";
import wasm from "vite-plugin-wasm";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    mkcert(),
    tailwindcss(),
    solidPlugin(),
    viteTsconfigPaths(),
    nodePolyfills(),
    // livestoreDevtoolsPlugin({ schemaPath: "./src/livestore/schema.ts" }),
  ],
  worker: { format: "es" },
  optimizeDeps: {
    // TODO remove once fixed https://github.com/vitejs/vite/issues/8427
    // shared-worker is loaded via `?sharedworker`; the dep optimizer registers it
    // but fails to emit the bundle, so the SharedWorker fetch 404s on dev restarts.
    exclude: ["@livestore/wa-sqlite", "@livestore/adapter-web/shared-worker"],
    // Excluding the shared-worker stops Vite from crawling its deps during the
    // initial scan, so they're discovered when the worker loads and trigger a
    // runtime re-optimize that bumps the browserHash mid-load — 404ing the worker
    // ("Failed to fetch a worker script"). Pre-bundle them so the hash is stable
    // before `store.ts`'s top-level `await getStore(...)` spawns the worker.
    include: [
      "@livestore/common",
      "@livestore/utils",
      "@livestore/utils/effect",
      "@livestore/devtools-web-common/web-channel",
      "@livestore/devtools-web-common/worker",
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 3003,
    proxy: {
      "/api/anthropic": {
        target: "https://api.anthropic.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/anthropic/, ""),
      },
    },
  },
  build: { target: "esnext", sourcemap: true },
});
