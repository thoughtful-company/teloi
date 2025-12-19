import { BrowserRuntimeContext } from "@/context/browserRuntime";
import { runtime, type BrowserRuntime } from "@/runtime";
import { render as solidRender } from "solid-testing-library";
import { JSX } from "solid-js";

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
  return solidRender(withRuntime(component));
}
