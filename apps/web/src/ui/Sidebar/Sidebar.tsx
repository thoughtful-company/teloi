import { createSignal, onMount, Show } from "solid-js";
import SidebarNav from "./SidebarNav";
import SidebarPages from "./SidebarPages";

const STORAGE_KEY = "teloi:sidebar:collapsed";

export default function Sidebar() {
  const [collapsed, setCollapsed] = createSignal(false);

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setCollapsed(true);
  });

  const toggle = () => {
    const next = !collapsed();
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return (
    <aside
      class={`flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 ${
        collapsed() ? "w-12" : "w-64"
      }`}
    >
      <div class="flex items-center justify-between p-2 border-b border-sidebar-border">
        <Show when={!collapsed()}>
          <span class="text-sm font-medium text-sidebar-foreground px-2">Teloi</span>
        </Show>
        <button
          onClick={toggle}
          class="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground"
          aria-label={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class={`w-4 h-4 transition-transform duration-200 ${collapsed() ? "rotate-180" : ""}`}
          >
            <polyline points="15,18 9,12 15,6" />
          </svg>
        </button>
      </div>

      <Show when={!collapsed()}>
        <SidebarNav />
        <div class="border-t border-sidebar-border my-2 mx-2" />
        <SidebarPages />
      </Show>
    </aside>
  );
}
