import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  server: {
    port: 3910,
    // entel serves at its root and sets no CORS headers, so the browser talks
    // to this origin under /api and the dev server forwards. Nothing in entel
    // changes for that.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3900",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: { target: "esnext", sourcemap: true },
});
