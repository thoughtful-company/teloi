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
