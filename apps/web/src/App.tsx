import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { Component, For, Show } from "solid-js";
import EditorBuffer from "./ui/EditorBuffer";
import PaneWrapper from "./ui/PaneWrapper";
import { Sidebar } from "./ui/Sidebar";

const App: Component = () => {
  const runtime = useBrowserRuntime();

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
      <Sidebar />
      <main class="flex-1 flex p-2.5 overflow-hidden">
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
  );
};

export default App;
