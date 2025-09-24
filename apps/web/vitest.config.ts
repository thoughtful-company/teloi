import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Use headless mode when running from CLI (not in watch mode)
// You can also force it with VITEST_BROWSER_HEADLESS=true environment variable
const isHeadless =
  process.env.VITEST_BROWSER_HEADLESS === "true" ||
  process.env.CI === "true" ||
  (!process.argv.includes("--watch") && !process.argv.includes("-w"));

export default mergeConfig(
  await viteConfig,
  defineConfig({
    resolve: {
      alias: [{ find: "@", replacement: resolve(__dirname, "./src") }],
    },
    base: "/",
    test: {
      projects: [
        {
          extends: true,
          test: {
            include: ["**/*.unit.{test,spec}.ts"],
            name: { label: "unit", color: "magenta" },
            environment: "node",
          },
        },
        {
          extends: true,
          test: {
            setupFiles: ["src/setup-tests.ts"],
            css: true,
            include: ["**/*.browser.{test,spec}.{ts,tsx}"],
            name: "browser",
            browser: {
              provider: "playwright",
              enabled: true,
              headless: isHeadless,
              instances: [
                {
                  browser: "chromium",
                  viewport: { width: 1440, height: 900 },
                },
              ],
              isolate: true,
            },
            testTimeout: 50000,
          },
        },
      ],
    },
    build: {
      sourcemap: true,
    },
  }),
);
