import type { BrowserRequirements, BrowserRuntime } from "@/runtime";
import type { Accessor } from "solid-js";
import { createEffect } from "solid-js";
import type { Effect } from "effect";
import type { useClickCapture } from "./useClickCapture";

interface UseFocusBlurOptions {
  isActive: Accessor<boolean>;
  clickCapture: ReturnType<typeof useClickCapture>;
  runtime: BrowserRuntime;
  /** Effect to run on focus (set active element, clear block selection, etc.) */
  onFocusEffect: Effect.Effect<void, unknown, BrowserRequirements>;
  /** Effect to run on blur */
  onBlurEffect: Effect.Effect<void, unknown, BrowserRequirements>;
  /** Optional: check before running blur effect (e.g., isTransitioningToBlockSelection) */
  shouldSkipBlur?: () => boolean;
}

interface UseFocusBlurResult {
  /** Call in onClick to handle focus with DOM selection capture */
  handleFocus: (e: MouseEvent) => void;
  /** Call in onBlur (or via action) to handle blur */
  handleBlur: () => void;
  /** Get captured DOM selection for resolveSelectionStrategy */
  getInitialSelection: () => { anchor: number; head: number } | null;
  /** Clear captured DOM selection (e.g., when entering block selection mode) */
  clearInitialSelection: () => void;
}

/**
 * Shared focus/blur handling for text-editable elements (Block, Title).
 *
 * Captures DOM selection on focus for precise click-to-cursor positioning.
 * When clicking on text to focus, the browser creates a DOM selection at the
 * click position BEFORE the focus event fires. This hook captures that selection
 * so the editor can place the cursor at the exact clicked character, not just
 * an approximate coordinate-based position.
 */
export function useFocusBlur({
  isActive,
  clickCapture,
  runtime,
  onFocusEffect,
  onBlurEffect,
  shouldSkipBlur,
}: UseFocusBlurOptions): UseFocusBlurResult {
  let initialSelection: { anchor: number; head: number } | null = null;

  createEffect(() => {
    if (!isActive()) {
      initialSelection = null;
    }
  });

  const handleFocus = (e: MouseEvent) => {
    clickCapture.capture(e);
    initialSelection = null;

    const domSelection = window.getSelection();
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      !domSelection.isCollapsed
    ) {
      const target = e.currentTarget as HTMLElement;
      const paragraph = target.querySelector("p");

      if (
        paragraph &&
        paragraph.contains(domSelection.anchorNode) &&
        paragraph.contains(domSelection.focusNode)
      ) {
        initialSelection = {
          anchor: domSelection.anchorOffset,
          head: domSelection.focusOffset,
        };
      }
    }

    runtime.runPromise(onFocusEffect);
  };

  const handleBlur = () => {
    // Don't clear model focus when window loses focus (alt-tab, tab switch).
    // Only clear when user clicks elsewhere within the document.
    if (!document.hasFocus()) {
      return;
    }

    if (shouldSkipBlur?.()) {
      return;
    }

    runtime.runPromise(onBlurEffect);
  };

  const getInitialSelection = () => initialSelection;
  const clearInitialSelection = () => {
    initialSelection = null;
  };

  return { handleFocus, handleBlur, getInitialSelection, clearInitialSelection };
}
