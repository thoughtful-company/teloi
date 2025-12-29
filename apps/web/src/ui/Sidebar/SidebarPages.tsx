import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { NavigationT } from "@/services/ui/Navigation";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { createSignal, For, onCleanup, onMount } from "solid-js";

const MAX_TITLE_LENGTH = 30;

function truncate(text: string): string {
  if (text.length <= MAX_TITLE_LENGTH) return text;
  return text.slice(0, MAX_TITLE_LENGTH - 1) + "...";
}

interface PageItemProps {
  nodeId: Id.Node;
}

function PageItem(props: PageItemProps) {
  const runtime = useBrowserRuntime();
  const Yjs = runtime.runSync(YjsT);
  const ytext = Yjs.getText(props.nodeId);

  const [title, setTitle] = createSignal(truncate(ytext.toString()) || "Untitled");

  onMount(() => {
    const observer = () => {
      const text = ytext.toString();
      setTitle(truncate(text) || "Untitled");
    };
    ytext.observe(observer);
    onCleanup(() => ytext.unobserve(observer));
  });

  const handleClick = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(props.nodeId);
      }),
    );
  };

  return (
    <button
      onClick={handleClick}
      class="w-full text-left px-1.5 py-1 rounded hover:bg-sidebar-accent text-sidebar-foreground text-sm truncate flex items-center gap-2"
    >
      <span class="w-4 h-4 flex items-center justify-center opacity-60">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
          <path d="M14,2H6A2,2,0,0,0,4,4V20a2,2,0,0,0,2,2H18a2,2,0,0,0,2-2V8Z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10,9 9,9 8,9" />
        </svg>
      </span>
      <span class="truncate">{title()}</span>
    </button>
  );
}

export default function SidebarPages() {
  const runtime = useBrowserRuntime();

  const rootNodesStream = Stream.unwrap(
    Effect.gen(function* () {
      const Node = yield* NodeT;
      return yield* Node.subscribeRootNodes();
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: rootNodesStream,
    project: (nodeIds) => ({ nodeIds }),
    initial: { nodeIds: [] as readonly Id.Node[] },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(dispose);
  });

  const handleNewPage = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Navigation = yield* NavigationT;
        const nodeId = yield* Node.createRootNode();
        yield* Navigation.navigateTo(nodeId, { focusTitle: true });
      }),
    );
  };

  return (
    <div class="flex-1 overflow-y-auto px-1">
      <h3 class="px-1.5 py-0.5 text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wide">
        Pages
      </h3>
      <For each={store.nodeIds}>
        {(nodeId) => <PageItem nodeId={nodeId} />}
      </For>
      <button
        onClick={handleNewPage}
        class="w-full text-left px-1.5 py-1 rounded hover:bg-sidebar-accent text-sidebar-foreground text-sm flex items-center gap-2"
      >
        <span class="w-4 h-4 flex items-center justify-center opacity-60">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <span class="opacity-60">New page</span>
      </button>
    </div>
  );
}
