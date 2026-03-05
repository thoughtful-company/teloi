import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { request } from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = path.resolve(__dirname, "../../..");

const DEV_SERVER_URL = "https://localhost:3003";

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
      sourcemap: true,
    }),
    build({
      entryPoints: ["src/preload.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      outdir: "out",
      outExtension: { ".js": ".cjs" },
      external: ["electron"],
      sourcemap: true,
    }),
  ]);
}

function waitForServer(url, timeout = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeout) {
        reject(new Error(`Dev server did not start within ${timeout / 1000}s`));
        return;
      }
      const req = request(url, { rejectUnauthorized: false }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(check, 500));
      req.end();
    }
    check();
  });
}

async function dev() {
  const vite = spawn("pnpm", ["-F", "@teloi/web", "dev"], {
    stdio: "inherit",
    cwd: MONOREPO_ROOT,
  });

  console.log("Waiting for Vite dev server...");
  await waitForServer(DEV_SERVER_URL);

  await buildMain();
  console.log("Main process built. Launching Electron...");

  const electron = spawn("pnpm", ["exec", "electron", "."], {
    stdio: "inherit",
    env: { ...process.env, DEV_SERVER_URL },
  });

  electron.on("close", () => {
    vite.kill();
    process.exit();
  });

  process.on("SIGINT", () => {
    vite.kill();
    electron.kill();
    process.exit();
  });
}

dev();
