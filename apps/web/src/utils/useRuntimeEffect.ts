import type { BrowserRequirements, BrowserRuntime } from "@/runtime";
import { Effect, Fiber } from "effect";
import { onCleanup, onMount } from "solid-js";

/**
 * Run an Effect on mount with proper cleanup on unmount.
 *
 * Unlike raw `runtime.runPromise()`, this tracks the fiber and
 * interrupts it when the component unmounts, preventing FiberFailure
 * errors from orphaned promises.
 */
export function useRuntimeEffect<A, E>(
  runtime: BrowserRuntime,
  effect: Effect.Effect<A, E, BrowserRequirements>,
): void {
  onMount(() => {
    const fiber = runtime.runFork(effect);

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber));
    });
  });
}
