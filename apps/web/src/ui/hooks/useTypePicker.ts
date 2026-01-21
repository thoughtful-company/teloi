import type { BrowserRuntime } from "@/runtime";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { TypePickerT } from "@/services/ui/TypePicker";
import { Effect, Option } from "effect";
import { createSignal, type Accessor } from "solid-js";
import type * as Y from "yjs";

export interface PickerState {
  visible: boolean;
  position: { x: number; y: number };
  from: number;
}

interface UseTypePickerOptions {
  nodeId: Id.Node;
  bufferId: Id.Buffer;
  elementId: Id.Block;
  getYtext: () => Y.Text;
  /** Accessor for current selection (needs head for cursor position) */
  getSelection: Accessor<{ head?: number } | null>;
  /** Accessor for current text content (for computing query) */
  textContent: Accessor<string>;
  runtime: BrowserRuntime;
  /** Log prefix for debugging, e.g. "[Block]" or "[Title]" */
  logPrefix: string;
}

/**
 * Manages type picker state and handlers for Block and Title components.
 *
 * The type picker appears when user types "#" and allows selecting or creating
 * types to apply to a node. This hook extracts the shared logic for:
 * - Opening/closing the picker
 * - Computing the query from text after "#"
 * - Selecting an existing type
 * - Creating a new type
 * - Cleaning up trigger text after selection
 */
export function useTypePicker({
  nodeId,
  bufferId,
  elementId,
  getYtext,
  getSelection,
  textContent,
  runtime,
  logPrefix,
}: UseTypePickerOptions) {
  const [pickerState, setPickerState] = createSignal<PickerState | null>(null);

  /** Compute the query text (everything after "#" up to cursor) */
  const getPickerQuery = () => {
    const state = pickerState();
    if (!state) return "";
    const text = textContent();
    const cursorPos = getSelection()?.head ?? text.length;
    // Extract text after "#" (from + 1) up to cursor
    return text.slice(state.from + 1, cursorPos);
  };

  const handleTypePickerOpen = (
    position: { x: number; y: number },
    from: number,
  ) => {
    setPickerState({ visible: true, position, from });
  };

  const handleTypePickerClose = () => {
    setPickerState(null);
  };

  /**
   * Shared cleanup after type picker action:
   * 1. Delete the "#query" trigger text
   * 2. Set selection back to where "#" was
   */
  const finishPickerAction = (state: PickerState) =>
    Effect.gen(function* () {
      const Buffer = yield* BufferT;

      const cursorPos = getSelection()?.head ?? getYtext().length;
      const deleteLength = cursorPos - state.from;
      if (deleteLength > 0) {
        getYtext().delete(state.from, deleteLength);
      }

      yield* Buffer.setSelection(
        bufferId,
        Option.some({
          anchor: { elementId },
          anchorOffset: state.from,
          focus: { elementId },
          focusOffset: state.from,
          goalX: null,
          goalLine: null,
          assoc: 0,
        }),
      );
    });

  const handleTypePickerSelect = (typeId: Id.Node) => {
    const state = pickerState();
    if (!state) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;

        yield* TypePicker.applyType(nodeId, typeId);
        yield* finishPickerAction(state);

        yield* Effect.logDebug(`${logPrefix} Type selected via picker`).pipe(
          Effect.annotateLogs({ nodeId, typeId }),
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError(`${logPrefix} Type picker select failed`).pipe(
            Effect.annotateLogs({
              nodeId,
              typeId,
              error: String(err),
            }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    setPickerState(null);
  };

  const handleTypePickerCreate = (name: string) => {
    const state = pickerState();
    if (!state) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;

        const typeId = yield* TypePicker.createType(name);
        yield* TypePicker.applyType(nodeId, typeId);
        yield* finishPickerAction(state);

        yield* Effect.logDebug(`${logPrefix} Type created via picker`).pipe(
          Effect.annotateLogs({ nodeId, typeId, name }),
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError(`${logPrefix} Type picker create failed`).pipe(
            Effect.annotateLogs({ nodeId, name, error: String(err) }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    setPickerState(null);
  };

  return {
    pickerState,
    getPickerQuery,
    handleTypePickerOpen,
    handleTypePickerClose,
    handleTypePickerSelect,
    handleTypePickerCreate,
  };
}
