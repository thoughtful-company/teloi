import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { Component, createSignal, For, onMount, Show } from "solid-js";
import EditorBuffer from "./ui/EditorBuffer";
import PaneWrapper from "./ui/PaneWrapper";
import { Sidebar } from "./ui/Sidebar";

const STORAGE_KEY = "teloi:sidebar:collapsed";

const App: Component = () => {
  const runtime = useBrowserRuntime();
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setSidebarCollapsed(true);
  });

  const toggleSidebar = () => {
    const next = !sidebarCollapsed();
    setSidebarCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const { panes, buffersByPane } = runtime.runSync(
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const sessionId = yield* Store.getSessionId();
      const windowId = Id.Window.make(sessionId);

      const windowDoc = yield* Store.getDocument("window", windowId);
      const paneIds = Option.isSome(windowDoc) ? windowDoc.value.panes : [];

      const buffersByPane = new Map<Id.Pane, readonly Id.Buffer[]>();
      for (const paneId of paneIds) {
        const paneDoc = yield* Store.getDocument("pane", paneId);
        if (Option.isSome(paneDoc)) {
          buffersByPane.set(paneId, paneDoc.value.buffers);
        }
      }

      return { panes: paneIds, buffersByPane };
    }),
  );

  return (
    <div class="flex h-full w-full">
      {/* Sidebar - full height when open */}
      <Show when={!sidebarCollapsed()}>
        <Sidebar onToggle={toggleSidebar} />
      </Show>

      {/* Main area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header - always visible, button only when sidebar closed */}
        <header class="flex items-center h-8 px-2 shrink-0">
          <Show when={sidebarCollapsed()}>
            <button
              onClick={toggleSidebar}
              class="w-10 h-6 flex items-center justify-center gap-0.5 rounded hover:bg-sidebar-accent text-sidebar-foreground"
              aria-label="Show sidebar"
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
          </Show>
        </header>

        {/* Panes */}
        <main class="flex-1 flex p-1 overflow-hidden">
          <For each={panes}>
            {(paneId) => (
              <PaneWrapper>
                <Show when={buffersByPane.get(paneId)}>
                  {(buffers) => (
                    <For each={[...buffers()]}>
                      {(bufferId) => <EditorBuffer bufferId={bufferId} />}
                    </For>
                  )}
                </Show>
              </PaneWrapper>
            )}
          </For>
        </main>
      </div>
    </div>
  );
};

export default App;
