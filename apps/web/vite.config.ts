import tailwindcss from "@tailwindcss/vite";
import mkcert from "vite-plugin-mkcert";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import solidPlugin from "vite-plugin-solid";
import viteTsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
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
    exclude: ["@livestore/wa-sqlite"],
  },
  server: {
    host: "0.0.0.0",
    port: 3003,
  },
  build: { target: "esnext", sourcemap: true },
});
