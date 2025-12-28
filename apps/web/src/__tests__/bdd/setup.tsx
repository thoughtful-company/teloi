import { BrowserRuntimeContext } from "@/context/browserRuntime";
import { runtime, type BrowserRuntime } from "@/runtime";
import { Effect } from "effect";
import { JSX } from "solid-js";
import { render as solidRender, waitFor } from "solid-testing-library";

export { runtime };
export type { BrowserRuntime };

/**
 * Provides a function that renders the given component inside a BrowserRuntimeContext provider populated with the test runtime.
 *
 * @param component - A function that returns the JSX element to render
 * @returns A function that renders the provided component wrapped with BrowserRuntimeContext using the shared test `runtime`
 */
export function withRuntime(component: () => JSX.Element) {
  return () => (
    <BrowserRuntimeContext.Provider value={runtime}>
      {component()}
    </BrowserRuntimeContext.Provider>
  );
}

/**
 * Render a Solid component wrapped with the BrowserRuntime context for testing.
 *
 * @param component - A function that returns the Solid JSX element to render
 * @returns An object with a `waitForElement` method that accepts a CSS selector and returns the matching `HTMLElement` or throws if no matching element is found within 2000 ms
 */
export function render(component: () => JSX.Element) {
  solidRender(withRuntime(component));

  return {
    waitForElement: (selector: string) =>
      Effect.promise(() =>
        waitFor(
          () => {
            const el = document.querySelector(selector);
            if (!el) throw new Error(`Element ${selector} not found`);
            return el as HTMLElement;
          },
          { timeout: 2000 },
        ),
      ),
  };
}