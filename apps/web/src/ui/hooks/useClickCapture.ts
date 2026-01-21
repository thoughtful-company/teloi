import { createEffect } from "solid-js";

interface UseClickCaptureOptions {
  isActive: () => boolean;
}

interface UseClickCaptureResult {
  /** Call in handleFocus to capture click position */
  capture: (e: MouseEvent) => void;
  /** Get current coords for resolveSelectionStrategy */
  get: () => { x: number; y: number } | null;
}

/**
 * Captures mouse click coordinates for click-to-focus cursor positioning.
 *
 * When clicking on unfocused text to activate an editor, the click coordinates
 * are captured so the editor can position the cursor at the click location.
 * Coords are automatically cleared when the element becomes inactive to prevent
 * stale coordinates from affecting subsequent programmatic activations.
 */
export function useClickCapture({
  isActive,
}: UseClickCaptureOptions): UseClickCaptureResult {
  let clickCoords: { x: number; y: number } | null = null;

  // Clear coords when becoming inactive to prevent stale coords
  // from affecting programmatic re-activation (e.g., backspace merge)
  createEffect(() => {
    if (!isActive()) {
      clickCoords = null;
    }
  });

  return {
    capture: (e: MouseEvent) => {
      clickCoords = { x: e.clientX, y: e.clientY };
    },
    get: () => clickCoords,
  };
}
