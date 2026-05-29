import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { NavigationT } from "@/services/ui/Navigation";
import { WorldT } from "@/services/ui/World";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { cn } from "@/utils/styling";
import { Effect, Option, Stream } from "effect";
import { createSignal, For, onCleanup, onMount } from "solid-js";
import Icon from "../Icon";
import { TREE_ICON, TREE_ROW, TREE_SECT, TREE_TWIST_SPACER } from "./tree";

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
  const Automerge = runtime.runSync(AutomergeT);

  const [title, setTitle] = createSignal("Untitled");

  onMount(() => {
    // Load initial title from Automerge
    runtime.runPromise(Automerge.getText(props.nodeId)).then((text) => {
      setTitle(truncate(text) || "Untitled");
    });

    // Subscribe to Automerge changes
    const onChange = () => {
      runtime.runPromise(Automerge.getText(props.nodeId)).then((text) => {
        setTitle(truncate(text) || "Untitled");
      });
    };
    Automerge.handle.on("change", onChange);
    onCleanup(() => Automerge.handle.off("change", onChange));
  });

  const handleClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(`/workspace/${props.nodeId}`, "_blank");
      return;
    }
    runtime.runPromise(
      Effect.gen(function* () {
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(props.nodeId);
      }),
    );
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(
      Effect.gen(function* () {
        const World = yield* WorldT;
        const Frame = yield* FrameT;
        const Navigation = yield* NavigationT;
        const Node = yield* NodeT;

        const maybeFrameId = yield* World.getActiveFrameId();
        if (Option.isSome(maybeFrameId)) {
          const assignedKhoraId = yield* Frame.getAssignedKhoraId(
            maybeFrameId.value,
          ).pipe(
            Effect.catchTag("FrameNotFoundError", () => Effect.succeed(null)),
          );

          if (assignedKhoraId === props.nodeId) {
            yield* Navigation.navigateTo(System.WORKSPACE);
          }
        }

        yield* Node.deleteNode(props.nodeId);
      }),
    );
  };

  return (
    <div class={TREE_ROW}>
      <button
        onClick={handleClick}
        class="flex h-full min-w-0 flex-1 items-center text-left"
      >
        <span class={TREE_TWIST_SPACER} aria-hidden="true" />
        <Icon name="node" class={TREE_ICON} />
        <span class="min-w-0 flex-1 truncate">{title()}</span>
      </button>
      <button
        onClick={handleDelete}
        class="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-text-secondary opacity-0 hover:bg-surface-active hover:text-text-primary focus:opacity-100 group-hover/row:opacity-100"
        aria-label="Delete page"
      >
        <Icon name="trash" class="size-5" />
      </button>
    </div>
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
    <>
      <h3 class={TREE_SECT}>Tree</h3>
      <For each={store.nodeIds}>{(nodeId) => <PageItem nodeId={nodeId} />}</For>
      <button
        onClick={handleNewPage}
        class={cn(TREE_ROW, "text-text-tertiary hover:text-text-primary")}
      >
        <span class={TREE_TWIST_SPACER} aria-hidden="true" />
        <span class={cn(TREE_ICON, "flex items-center justify-center")}>
          <Icon name="plus" class="size-4" />
        </span>
        <span class="min-w-0 flex-1 truncate">New page</span>
      </button>
    </>
  );
}
