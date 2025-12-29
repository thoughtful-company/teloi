import { For } from "solid-js";

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: "Inbox", path: "/inbox", icon: "inbox" },
  { label: "The Box", path: "/box", icon: "box" },
  { label: "Calendar", path: "/calendar", icon: "calendar" },
];

export default function SidebarNav() {
  return (
    <nav class="px-2 py-1">
      <For each={navItems}>
        {(item) => (
          <a
            href={item.path}
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground text-sm"
          >
            <span class="w-4 h-4 flex items-center justify-center opacity-60">
              {item.icon === "inbox" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                  <polyline points="22,12 16,12 14,15 10,15 8,12 2,12" />
                  <path d="M5.45,5.11L2,12v6a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2V12l-3.45-6.89A2,2,0,0,0,16.76,4H7.24A2,2,0,0,0,5.45,5.11Z" />
                </svg>
              )}
              {item.icon === "box" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                  <path d="M21,16V8a2,2,0,0,0-1-1.73l-7-4a2,2,0,0,0-2,0l-7,4A2,2,0,0,0,3,8v8a2,2,0,0,0,1,1.73l7,4a2,2,0,0,0,2,0l7-4A2,2,0,0,0,21,16Z" />
                  <polyline points="3.27,6.96 12,12.01 20.73,6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              )}
              {item.icon === "calendar" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              )}
            </span>
            <span>{item.label}</span>
          </a>
        )}
      </For>
    </nav>
  );
}
