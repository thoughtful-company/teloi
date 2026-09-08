import { cleanup } from "@solidjs/testing-library";
import { beforeEach } from "vitest";

// Unmount what the previous test rendered before the next one starts, per the
// root docs/testing.md: cleanup in beforeEach, never afterEach.
beforeEach(() => {
  cleanup();
  // A test that hid the document and failed before showing it again would
  // otherwise leave every later test without a poll fiber. Deleting the own
  // property puts jsdom's getter back, which says visible.
  Reflect.deleteProperty(document, "visibilityState");
});

// The router scrolls to the top after a navigation, and jsdom has no layout
// to scroll, so it logs "Not implemented" on every link click. Nothing here
// reads scroll position; an empty scrollTo keeps the output readable.
window.scrollTo = () => {};
