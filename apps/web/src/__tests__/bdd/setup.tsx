import { BrowserRuntimeContext } from "@/context/browserRuntime";
import { runtime, type BrowserRuntime } from "@/runtime";
import { Effect } from "effect";
import { JSX } from "solid-js";
import { render as solidRender, waitFor } from "solid-testing-library";

export { runtime };
export type { BrowserRuntime };

/**
 * Wraps a component with the BrowserRuntimeContext provider for testing.
 */
export function withRuntime(component: () => JSX.Element) {
  return () => (
    <BrowserRuntimeContext.Provider value={runtime}>
      {component()}
    </BrowserRuntimeContext.Provider>
  );
}

/**
 * Renders a component with the runtime context provider.
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
