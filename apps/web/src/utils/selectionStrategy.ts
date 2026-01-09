import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { Effect, Option } from "effect";

/** Selection info from editor (anchor, head, assoc) */
export interface EditorSelectionInfo {
  anchor: number;
  head: number;
  assoc: -1 | 0 | 1;
}

/**
 * Update buffer selection from editor selection change.
 * Preserves goalX/goalLine for chained vertical navigation when staying on same node.
 */
export const updateEditorSelection = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  selection: EditorSelectionInfo,
) =>
  Effect.gen(function* () {
    const Buffer = yield* BufferT;

    const existingSelection = yield* Buffer.getSelection(bufferId);
    const isSameNode =
      Option.isSome(existingSelection) &&
      existingSelection.value.anchor.nodeId === nodeId;
    const goalX = isSameNode ? existingSelection.value.goalX : null;
    const goalLine = isSameNode ? existingSelection.value.goalLine : null;

    yield* Buffer.setSelection(
      bufferId,
      Option.some({
        anchor: { nodeId },
        anchorOffset: selection.anchor,
        focus: { nodeId },
        focusOffset: selection.head,
        goalX,
        goalLine,
        assoc: selection.assoc,
      }),
    );
  });

/** Build a collapsed selection (anchor === focus) for Buffer.setSelection */
export const makeCollapsedSelection = (
  targetNodeId: Id.Node,
  offset: number,
  opts?: {
    goalX?: number | null;
    goalLine?: "first" | "last" | null;
  },
) =>
  Option.some({
    anchor: { nodeId: targetNodeId },
    anchorOffset: offset,
    focus: { nodeId: targetNodeId },
    focusOffset: offset,
    goalX: opts?.goalX ?? null,
    goalLine: opts?.goalLine ?? null,
    assoc: 0 as const,
  });

export type SelectionStrategy =
  | { type: "click"; x: number; y: number }
  | { type: "range"; anchor: number; head: number; assoc?: -1 | 0 | 1 }
  | { type: "goalX"; goalX: number; goalLine: "first" | "last" }
  | { type: "default" };

export interface SelectionInputs {
  clickCoords: {
    x: number;
    y: number;
  } | null;
  domSelection: {
    anchor: number;
    head: number;
  } | null;
  // shouldn't our model selection always require "first" or "last" if you specify goal X?
  modelSelection: {
    anchor: number;
    head: number;
    goalX: number | null;
    goalLine: "first" | "last" | null;
    assoc: 1 | -1 | 0;
  } | null;
}

export function resolveSelectionStrategy(
  input: SelectionInputs,
): SelectionStrategy {
  if (input.clickCoords !== null) {
    if (input.domSelection !== null) {
      return {
        type: "range",
        anchor: input.domSelection.anchor,
        head: input.domSelection.head,
      };
    }

    return { type: "click", x: input.clickCoords.x, y: input.clickCoords.y };
  }

  if (input.modelSelection == null) {
    return {
      type: "default",
    };
  }

  if (input.modelSelection.goalX !== null) {
    // todo specifying "last" as default here seems to be an unreliable hack
    return {
      type: "goalX",
      goalX: input.modelSelection.goalX,
      goalLine: input.modelSelection.goalLine || "last",
    };
  }

  return {
    type: "range",
    anchor: input.modelSelection.anchor,
    head: input.modelSelection.head,
    assoc: input.modelSelection.assoc,
  };
}
