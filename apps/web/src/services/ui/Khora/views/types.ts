import { Id, System } from "@/schema";

/** The rendering mode of a view */
export type ViewType = "page" | "chat" | "table";

/** View metadata for UI display */
export interface ViewInfo {
  readonly id: Id.Node;
  readonly name: string;
  readonly type: ViewType;
}

export const resolveViewType = (typeIds: readonly Id.Node[]): ViewType => {
  if (typeIds.includes(System.CHAT_VIEW)) return "chat";
  if (typeIds.includes(System.TABLE_VIEW)) return "table";
  return "page";
};

export const resolveEffectiveActiveViewId = (
  activeViewId: Id.Node | null,
  availableViews: readonly ViewInfo[],
): Id.Node | null => {
  const activeView = availableViews.find((view) => view.id === activeViewId);
  if (activeView) return activeView.id;

  return (
    availableViews.find((view) => view.type === "chat" || view.type === "table")
      ?.id ?? availableViews[0]?.id ?? null
  );
};

/** Resolve the active view type from explicit selection or auto-detection. */
export const resolveActiveViewType = (
  activeViewId: Id.Node | null,
  availableViews: readonly ViewInfo[],
): ViewType => {
  const effectiveActiveViewId = resolveEffectiveActiveViewId(
    activeViewId,
    availableViews,
  );
  const activeView = availableViews.find((view) => view.id === effectiveActiveViewId);
  return activeView?.type ?? "page";
};
