import { type Accessor, type Setter, createEffect } from "solid-js";

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
}

/**
 * Auto-dismiss the type picker when trigger conditions are invalidated.
 *
 * The picker opens immediately on # keystroke, but Y.Text content updates
 * asynchronously. We track "activation" to avoid dismissing the picker
 * before the # character appears in the text signal. Once activated,
 * the picker closes if:
 * - The # at the trigger position is deleted
 * - A space is typed (breaks the query pattern)
 */
export function usePickerDismissal({
  pickerState,
  setPickerState,
  textContent,
  getPickerQuery,
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
}
