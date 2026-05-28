import { Id } from "@/schema";
import type { ViewInfo } from "@/services/ui/View";
import { For, Show } from "solid-js";

interface ViewTabsProps {
  availableViews: readonly ViewInfo[];
  activeViewId: Id.Node | null;
  onTabClick: (viewId: Id.Node) => void;
}

/**
 * Tab bar for switching between views of a node.
 * Only renders when 2+ views exist.
 * Pure render component — no data fetching.
 */
export default function ViewTabs(props: ViewTabsProps) {
  return (
    <Show when={props.availableViews.length >= 2}>
      <div
        data-testid="view-tabs"
        class="mx-auto max-w-[var(--max-line-width)] w-full flex gap-1 border-b border-rule-subtle mb-2"
      >
        <For each={props.availableViews}>
          {(view) => (
            <button
              data-testid="view-tab"
              data-active={view.id === props.activeViewId ? "true" : undefined}
              class={`px-3 py-1.5 text-sm rounded-t transition-colors ${
                view.id === props.activeViewId
                  ? "bg-rule-subtle/20 border-b-2 border-text-primary font-medium"
                  : "hover:bg-rule-subtle/10 text-text-secondary"
              }`}
              onClick={() => props.onTabClick(view.id)}
            >
              {view.name}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
