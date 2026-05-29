import { For, Show } from "solid-js";
import Icon, { type IconName } from "../Icon";

export type SidebarView = "home" | "chat" | "search";

interface NavPill {
  view: SidebarView;
  label: string;
  icon: IconName;
}

const pills: NavPill[] = [
  { view: "home", label: "Home", icon: "house" },
  { view: "chat", label: "Chat", icon: "chats-circle" },
  { view: "search", label: "Search", icon: "magnifying-glass" },
];

interface SidebarNavProps {
  active: SidebarView;
  onPick: (view: SidebarView) => void;
}

export default function SidebarNav(props: SidebarNavProps) {
  return (
    <div class="flex items-center gap-0.5 px-3 pb-2.5 pt-1">
      <For each={pills}>
        {(pill) => {
          const isActive = () => props.active === pill.view;
          return (
            <button
              onClick={() => props.onPick(pill.view)}
              aria-label={pill.label}
              aria-pressed={isActive()}
              class="inline-flex h-[30px] min-w-[30px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary data-[active=true]:bg-surface-active data-[active=true]:text-text-primary"
              data-active={isActive()}
            >
              <Icon name={pill.icon} class="size-5" />
              <Show when={isActive()}>
                <span class="text-sm font-label tracking-tight">
                  {pill.label}
                </span>
              </Show>
            </button>
          );
        }}
      </For>
    </div>
  );
}
