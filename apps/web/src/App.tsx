import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { BootstrapT } from "@/services/domain/Bootstrap";
import { StoreT } from "@/services/external/Store";
import { KeyEventBusT } from "@/services/ui/KeyEventBus";
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
import TopBar from "./ui/TopBar";
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
        const worldId = Id.World.make(sessionId);

        const worldDoc = yield* Store.getDocument("world", worldId);
        if (Option.isNone(worldDoc)) return;

        const firstPaneId = worldDoc.value.panes[0];
        if (!firstPaneId) return;

        const paneDoc = yield* Store.getDocument("pane", firstPaneId);
        if (Option.isNone(paneDoc)) return;

        const firstFrameId = paneDoc.value.frames[0];
        if (!firstFrameId) return;

        const frameDoc = yield* Store.getDocument("frame", firstFrameId);
        if (Option.isNone(frameDoc)) return;

        const nodeId = frameDoc.value.assignedKhoraId;
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

  const { panes, framesByPane } = runtime.runSync(
    Effect.gen(function* () {
      // Ensure system nodes exist before anything else
      const Bootstrap = yield* BootstrapT;
      yield* Bootstrap.ensureSystemNodes();

      const Store = yield* StoreT;
      const sessionId = yield* Store.getSessionId();
      const worldId = Id.World.make(sessionId);

      const worldDoc = yield* Store.getDocument("world", worldId);
      const paneIds = Option.isSome(worldDoc) ? worldDoc.value.panes : [];

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
    <div class="flex h-full w-full gap-[var(--gap-pane)] bg-surface-app p-[var(--inset-app)]">
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
      <div class="flex-1 min-w-0 flex flex-col">
        <TopBar
          sidebarCollapsed={sidebarCollapsed()}
          onToggleSidebar={toggleSidebar}
          panes={panes}
          framesByPane={framesByPane}
        />

        {/* Panes */}
        <main class="flex-1 flex gap-[var(--gap-pane)]">
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
