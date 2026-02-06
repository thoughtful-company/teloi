import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { BootstrapT } from "@/services/domain/Bootstrap";
import { StoreT } from "@/services/external/Store";
import { KeyEventBusT } from "@/services/ui/KeyEventBus";
import { NavigationT } from "@/services/ui/Navigation";
import { Effect, Fiber, Option } from "effect";
import {
  Component,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import CommandPalette from "./ui/CommandPalette";
import FrameView from "./ui/FrameView";
import PaneWrapper from "./ui/PaneWrapper";
import { Sidebar } from "./ui/Sidebar";
import type { CommandContext } from "./commands";

const STORAGE_KEY = "teloi:sidebar:collapsed";

const App: Component = () => {
  const runtime = useBrowserRuntime();
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);
  const [commandContext, setCommandContext] =
    createSignal<CommandContext | null>(null);

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") setSidebarCollapsed(true);

    // Start unified keyboard handler
    const keyboardFiber = runtime.runFork(
      Effect.gen(function* () {
        const KeyEventBus = yield* KeyEventBusT;
        yield* KeyEventBus.runAppKeyboardHandler({
          onToggleSidebar: toggleSidebar,
          onOpenCommandPalette: openCommandPalette,
        });
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(keyboardFiber));
    });
  });

  const openCommandPalette = () => {
    // Get context from first frame (MVP simplification)
    runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);

        const windowDoc = yield* Store.getDocument("window", windowId);
        if (Option.isNone(windowDoc)) return;

        const firstPaneId = windowDoc.value.panes[0];
        if (!firstPaneId) return;

        const paneDoc = yield* Store.getDocument("pane", firstPaneId);
        if (Option.isNone(paneDoc)) return;

        const firstFrameId = paneDoc.value.frames[0];
        if (!firstFrameId) return;

        const frameDoc = yield* Store.getDocument("frame", firstFrameId);
        if (Option.isNone(frameDoc)) return;

        const nodeId = frameDoc.value.assignedNodeId;
        if (!nodeId) return;

        setCommandContext({
          frameId: firstFrameId,
          nodeId: nodeId as Id.Node,
        });
        setCommandPaletteOpen(true);
      }),
    );
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed();
    setSidebarCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  const handleHomeClick = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(System.WORKSPACE);
      }),
    );
  };

  const { panes, framesByPane } = runtime.runSync(
    Effect.gen(function* () {
      // Ensure system nodes exist before anything else
      const Bootstrap = yield* BootstrapT;
      yield* Bootstrap.ensureSystemNodes();

      const Store = yield* StoreT;
      const sessionId = yield* Store.getSessionId();
      const windowId = Id.Window.make(sessionId);

      const windowDoc = yield* Store.getDocument("window", windowId);
      const paneIds = Option.isSome(windowDoc) ? windowDoc.value.panes : [];

      const framesByPane = new Map<Id.Pane, readonly Id.Frame[]>();
      for (const paneId of paneIds) {
        const paneDoc = yield* Store.getDocument("pane", paneId);
        if (Option.isSome(paneDoc)) {
          framesByPane.set(paneId, paneDoc.value.frames);
        }
      }

      return { panes: paneIds, framesByPane };
    }),
  );

  return (
    <div class="flex h-full w-full">
      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen()}
        onClose={() => setCommandPaletteOpen(false)}
        context={commandContext()}
      />

      {/* Sidebar - full height when open */}
      <Show when={!sidebarCollapsed()}>
        <Sidebar onToggle={toggleSidebar} />
      </Show>

      {/* Main area */}
      <div class="flex-1 flex flex-col overflow-hidden">
        {/* Header - always visible, button only when sidebar closed */}
        <header class="flex items-center h-12 px-2 shrink-0 gap-1">
          {/* Home button - always visible */}
          <button
            onClick={handleHomeClick}
            class="w-8 h-8 flex items-center justify-center rounded hover:bg-sidebar-accent text-sidebar-foreground"
            aria-label="Go to home"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-5 h-5"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>
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
                <Show when={framesByPane.get(paneId)}>
                  {(frames) => (
                    <For each={[...frames()]}>
                      {(frameId) => <FrameView frameId={frameId} />}
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
