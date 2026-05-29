import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { NavigationT } from "@/services/ui/Navigation";
import { Effect } from "effect";
import { For } from "solid-js";
import Icon, { type IconName } from "../Icon";
import SidebarPages from "./SidebarPages";
import { TREE_ICON, TREE_PANE, TREE_ROW, TREE_TWIST_SPACER } from "./tree";

interface SystemRow {
  label: string;
  nodeId: Id.Node;
  icon: IconName;
  path: string;
}

// Fixed workspace surfaces (docs/app-redesign.md §7), backed by system nodes.
const systemRows: SystemRow[] = [
  { label: "Inbox", nodeId: System.INBOX, icon: "tray", path: "/inbox" },
  {
    label: "Calendar",
    nodeId: System.CALENDAR,
    icon: "calendar-blank",
    path: "/calendar",
  },
  { label: "The Box", nodeId: System.THE_BOX, icon: "package", path: "/box" },
  { label: "Types", nodeId: System.SCHEMA, icon: "tag", path: "/types" },
];

export default function SidebarHome() {
  const runtime = useBrowserRuntime();

  const handleClick = (row: SystemRow, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(row.path, "_blank");
      return;
    }
    runtime.runPromise(
      Effect.gen(function* () {
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(row.nodeId);
      }),
    );
  };

  return (
    <div class={TREE_PANE}>
      <For each={systemRows}>
        {(row) => (
          <button class={TREE_ROW} onClick={(e) => handleClick(row, e)}>
            <span class={TREE_TWIST_SPACER} aria-hidden="true" />
            <Icon name={row.icon} class={TREE_ICON} />
            <span class="min-w-0 flex-1 truncate">{row.label}</span>
          </button>
        )}
      </For>
      <SidebarPages />
    </div>
  );
}
