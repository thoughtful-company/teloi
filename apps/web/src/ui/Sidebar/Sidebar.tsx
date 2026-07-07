import { createSignal, Show } from "solid-js";
import Icon from "../Icon";
import SidebarHome from "./SidebarHome";
import SidebarNav, { type SidebarView } from "./SidebarNav";
import SidebarStub from "./SidebarStub";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const HEAD_ACTION =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-hover hover:text-text-primary";

export default function Sidebar() {
  const [view, setView] = createSignal<SidebarView>("home");

  return (
    <aside
      class="flex h-full w-64 shrink-0 flex-col overflow-hidden rounded-[var(--radius-pane)] border border-border-pane shadow-pane"
      style={{ "background-image": "var(--gradient-sidebar)" }}
    >
      {/* Header: workspace switcher + settings. The collapse toggle lives in the
          top bar (§12); traffic lights are native OS chrome — not rendered here.
          The header bar is draggable for Electron window move. On macOS Electron
          we inset the content (pl-18) so it clears the native traffic lights
          (positioned at x:16; the cluster ends ~x:72). */}
      <div class="app-region-drag flex h-[34px] shrink-0 items-center gap-1 pl-3 pr-1.5 electron-mac:pl-18">
        <WorkspaceSwitcher />
        <button
          class={`${HEAD_ACTION} app-region-no-drag`}
          aria-label="Settings"
          title="Settings (coming soon)"
        >
          <Icon name="gear-six" class="size-5" />
        </button>
      </div>

      <SidebarNav active={view()} onPick={setView} />

      <Show when={view() === "home"}>
        <SidebarHome />
      </Show>
      <Show when={view() === "chat"}>
        <SidebarStub
          icon="chats-circle"
          title="Chat"
          message="The chat lens is coming soon."
        />
      </Show>
      <Show when={view() === "search"}>
        <SidebarStub
          icon="magnifying-glass"
          title="Search"
          message="Use ⌘K to jump for now."
        />
      </Show>
    </aside>
  );
}
