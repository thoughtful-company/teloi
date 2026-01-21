/**
 * Vitest browser setup for @teloi/web.
 * This file runs in the browser context before tests execute.
 *
 * Responsibilities:
 * - Ensure Solid components are cleaned up between tests.
 * - Suppress FiberFailure from Effect runtime disposal.
 * - Provide a place to add future global test helpers or polyfills.
 */

import { cleanup } from "solid-testing-library";
import { beforeEach } from "vitest";

// Suppress FiberFailure from orphaned effects during runtime disposal.
// When tests cleanup and dispose the Effect runtime, any in-flight fibers
// throw unhandled rejections. This is expected behavior, not a real error.
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const isFiberFailure =
    reason?.name === "FiberFailure" ||
    reason?._tag === "FiberFailure" ||
    reason?.constructor?.name === "FiberFailure" ||
    String(reason).includes("FiberFailure");
  if (isFiberFailure) {
    e.preventDefault();
  }
});

beforeEach(() => {
  cleanup();
});
