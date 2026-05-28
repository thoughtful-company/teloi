import SidebarNav from "./SidebarNav";
import SidebarPages from "./SidebarPages";

interface SidebarProps {
  onToggle: () => void;
}

export default function Sidebar(props: SidebarProps) {
  return (
    <aside class="flex h-full w-64 shrink-0 flex-col overflow-hidden bg-surface-pane/90 backdrop-blur-md border border-border-pane rounded-[var(--radius-pane)] shadow-pane">
      {/* Header with toggle on right — draggable for Electron window move */}
      <div class="electron-mac:pl-18 electron-mac:pt-1 flex items-center justify-between p-2 app-region-drag">
        <span class="text-sm font-medium text-text-primary px-1">
          Teloi
        </span>
        <button
          onClick={props.onToggle}
          class="w-10 h-6 flex items-center justify-center gap-0.5 rounded hover:bg-surface-hover text-text-primary app-region-no-drag"
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
      <div class="border-t border-border-pane my-1 mx-2" />
      <SidebarPages />
    </aside>
  );
}
