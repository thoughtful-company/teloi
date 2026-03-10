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

/** Resolve the active view type from explicit selection or auto-detection. */
export const resolveActiveViewType = (
  activeViewId: Id.Node | null,
  availableViews: readonly ViewInfo[],
): ViewType => {
  const activeView = availableViews.find((v) => v.id === activeViewId);
  if (activeView) return activeView.type;
  return (
    availableViews.find((v) => v.type === "chat" || v.type === "table")?.type ??
    "page"
  );
};
