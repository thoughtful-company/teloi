import { type Accessor, type Setter, createEffect, onCleanup } from "solid-js";

interface PickerState {
  visible: boolean;
  position: { x: number; y: number };
  from: number;
}

interface UsePickerDismissalParams {
  pickerState: Accessor<PickerState | null>;
  setPickerState: Setter<PickerState | null>;
  textContent: Accessor<string>;
  getPickerQuery: () => string;
  /** Element ref to find scroll container. If provided, locks scroll while picker is open. */
  scrollAnchor?: Accessor<HTMLElement | undefined>;
}

/**
 * Auto-dismiss the type picker when trigger conditions are invalidated,
 * and lock scrolling while the picker is open.
 *
 * The picker opens immediately on # keystroke, but Y.Text content updates
 * asynchronously. We track "activation" to avoid dismissing the picker
 * before the # character appears in the text signal. Once activated,
 * the picker closes if:
 * - The # at the trigger position is deleted
 * - A space is typed (breaks the query pattern)
 *
 * If scrollAnchor is provided, scrolling is disabled on the container
 * while the picker is open to keep the popup anchored to the cursor.
 */
export function usePickerDismissal({
  pickerState,
  setPickerState,
  textContent,
  getPickerQuery,
  scrollAnchor,
}: UsePickerDismissalParams): void {
  let activated = false;

  createEffect(() => {
    const state = pickerState();
    if (!state) {
      activated = false;
      return;
    }

    const text = textContent();
    const hasHash = text.length > state.from && text.charAt(state.from) === "#";

    // Wait for Y.Text sync before enforcing dismissal
    if (!activated) {
      if (hasHash) activated = true;
      return;
    }

    // Dismiss if # deleted or space typed
    if (!hasHash || getPickerQuery().includes(" ")) {
      setPickerState(null);
    }
  });

  createEffect(() => {
    const state = pickerState();
    const anchor = scrollAnchor?.();

    if (!state || !anchor) return;

    const scrollContainer = anchor.closest(
      ".overflow-y-auto, .overflow-auto, [style*='overflow']",
    ) as HTMLElement | null;

    const lockedScrollTop = scrollContainer?.scrollTop ?? 0;
    const lockedWindowScroll = window.scrollY;

    // Prevent wheel events from scrolling the page, but allow scrolling inside the picker
    const preventWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      // Allow scrolling inside the type picker popup
      if (target.closest("[data-testid='type-picker']")) {
        return;
      }
      e.preventDefault();
    };

    // Reset scroll if it somehow changes (fallback for programmatic changes)
    const resetScroll = () => {
      if (scrollContainer) scrollContainer.scrollTop = lockedScrollTop;
    };

    const resetWindowScroll = () => {
      window.scrollTo(window.scrollX, lockedWindowScroll);
    };

    scrollContainer?.addEventListener("wheel", preventWheel, {
      passive: false,
    });
    scrollContainer?.addEventListener("scroll", resetScroll);
    window.addEventListener("wheel", preventWheel, { passive: false });
    window.addEventListener("scroll", resetWindowScroll);

    onCleanup(() => {
      scrollContainer?.removeEventListener("wheel", preventWheel);
      scrollContainer?.removeEventListener("scroll", resetScroll);
      window.removeEventListener("wheel", preventWheel);
      window.removeEventListener("scroll", resetWindowScroll);
    });
  });
}
