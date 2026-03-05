import { build } from "esbuild";
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";

async function buildMain() {
  await Promise.all([
    build({
      entryPoints: ["src/main.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      outdir: "out",
      outExtension: { ".js": ".mjs" },
      external: ["electron"],
      minify: true,
      sourcemap: false,
    }),
    build({
      entryPoints: ["src/preload.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      outdir: "out",
      outExtension: { ".js": ".cjs" },
      external: ["electron"],
      minify: true,
      sourcemap: false,
    }),
  ]);

  console.log("Main process built.");

  // Copy the web app build output into renderer/
  const webDist = resolve("../web/dist");
  if (existsSync(webDist)) {
    const rendererDir = resolve("renderer");
    cpSync(webDist, rendererDir, { recursive: true });
    console.log("Renderer copied from web build.");
  } else {
    console.log("No web build found at", webDist, "— skipping renderer copy.");
    console.log("Run 'pnpm -F @teloi/web build' first for production builds.");
  }
}

buildMain();
