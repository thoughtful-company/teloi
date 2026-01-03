import SidebarNav from "./SidebarNav";
import SidebarPages from "./SidebarPages";

interface SidebarProps {
  onToggle: () => void;
}

export default function Sidebar(props: SidebarProps) {
  return (
    <aside class="flex flex-col h-full w-64 bg-sidebar/80 backdrop-blur-md border border-sidebar-border rounded-lg m-1">
      {/* Header with toggle on right */}
      <div class="flex items-center justify-between p-2">
        <span class="text-sm font-medium text-sidebar-foreground px-1">Teloi</span>
        <button
          onClick={props.onToggle}
          class="w-10 h-6 flex items-center justify-center gap-0.5 rounded hover:bg-sidebar-accent text-sidebar-foreground"
          aria-label="Hide sidebar"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-6 h-6"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-4 h-4"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </button>
      </div>

      <SidebarNav />
      <div class="border-t border-sidebar-border my-1 mx-2" />
      <SidebarPages />
    </aside>
  );
}
