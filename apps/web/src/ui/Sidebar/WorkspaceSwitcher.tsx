import { createSignal, For, Show } from "solid-js";
import Icon from "../Icon";

interface Workspace {
  id: string;
  name: string;
  glyph: string;
}

// Visual-only for this pass (docs/app-redesign.md §10). The workspace is
// hardcoded; the dropdown renders the single current workspace plus a stubbed
// "New workspace" action. Glyph + hashed color and real multi-workspace
// support are deferred until the workspace data model exists.
const DEFAULT_WORKSPACE: Workspace = { id: "home", name: "Teloi", glyph: "T" };
const WORKSPACES: Workspace[] = [DEFAULT_WORKSPACE];

export default function WorkspaceSwitcher() {
  const [open, setOpen] = createSignal(false);
  const [activeId, setActiveId] = createSignal(DEFAULT_WORKSPACE.id);
  const current = () =>
    WORKSPACES.find((w) => w.id === activeId()) ?? DEFAULT_WORKSPACE;

  return (
    <div class="relative min-w-0 flex-1">
      <button
        onClick={() => setOpen((o) => !o)}
        class="app-region-no-drag flex w-full items-center gap-2 rounded-md px-2.5 py-1 text-left text-text-primary hover:bg-surface-hover"
      >
        <span class="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-blue-100 text-[11px] font-semibold tracking-wide text-blue-700">
          {current().glyph}
        </span>
        <span class="min-w-0 flex-1 truncate text-sm font-label">
          {current().name}
        </span>
        <Icon
          name="caret-right"
          class="size-4 rotate-90 text-text-placeholder"
        />
      </button>

      <Show when={open()}>
        {/* Click-outside catcher */}
        <button
          class="fixed inset-0 z-10 cursor-default"
          aria-hidden="true"
          tabindex={-1}
          onClick={() => setOpen(false)}
        />
        <div class="absolute inset-x-0 top-[calc(100%+4px)] z-20 flex flex-col gap-px rounded-md border border-border-pane bg-surface-overlay p-1 shadow-overlay">
          <For each={WORKSPACES}>
            {(w) => (
              <button
                onClick={() => {
                  setActiveId(w.id);
                  setOpen(false);
                }}
                class="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-sm text-text-primary hover:bg-surface-hover data-[active=true]:bg-surface-active"
                data-active={w.id === activeId()}
              >
                <span class="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-blue-100 text-[11px] font-semibold tracking-wide text-blue-700">
                  {w.glyph}
                </span>
                <span class="truncate">{w.name}</span>
              </button>
            )}
          </For>
          <div class="mx-0.5 my-1 h-px bg-rule-subtle" />
          <button
            disabled
            class="flex items-center gap-2 rounded-sm px-1.5 py-1 text-left text-sm text-text-tertiary opacity-60"
            title="Multi-workspace support is not implemented yet"
          >
            <span class="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-surface-active text-text-tertiary">
              <Icon name="plus" class="size-5" />
            </span>
            <span>New workspace</span>
          </button>
        </div>
      </Show>
    </div>
  );
}
