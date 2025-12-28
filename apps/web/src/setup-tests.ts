/**
 * Vitest browser setup for @teloi/web.
 * This file runs in the browser context before tests execute.
 *
 * Responsibilities:
 * - Ensure Solid components are cleaned up between tests.
 * - Provide a place to add future global test helpers or polyfills.
 */

import { cleanup } from "solid-testing-library";
import { beforeEach } from "vitest";

beforeEach(() => {
  cleanup();
});
