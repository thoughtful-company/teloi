import { tables } from "@/livestore/schema";
import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Option } from "effect";
import { createSignal, For, onMount, Show } from "solid-js";

/** Well-known tuple type for linking nodes to views */
const HAS_VIEW_TUPLE_TYPE = "sys:tuple-type:has-view" as Id.Node;

interface ViewTabsProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  activeViewId: Id.Node | null;
}

interface ViewInfo {
  id: Id.Node;
  name: string;
}

/**
 * Tab bar for switching between views of a node.
 * Only renders when 2+ views exist.
 */
export default function ViewTabs(props: ViewTabsProps) {
  // Don't destructure props in SolidJS - it breaks reactivity
  const bufferId = () => props.bufferId;
  const nodeId = () => props.nodeId;
  const activeViewId = () => props.activeViewId;
  const runtime = useBrowserRuntime();
  const [views, setViews] = createSignal<ViewInfo[]>([]);

  onMount(() => {
    const loadViews = Effect.gen(function* () {
      const Store = yield* StoreT;
      const Yjs = yield* YjsT;

      // Find all HAS_VIEW tuples where this node is at position 0
      // HAS_VIEW tuple format: (targetNode, viewNode)
      const members = yield* Store.query(
        tables.tupleMembers.select().where({ position: 0, nodeId: nodeId() }),
      );

      const viewInfos: ViewInfo[] = [];

      for (const member of members) {
        // Get the tuple to check its type
        const tuple = yield* Store.query(
          tables.tuples
            .select()
            .where({ id: member.tupleId, tupleTypeId: HAS_VIEW_TUPLE_TYPE })
            .first({ fallback: () => null }),
        );

        if (tuple) {
          // Get the view node (position 1)
          const viewMember = yield* Store.query(
            tables.tupleMembers
              .select()
              .where({ tupleId: tuple.id, position: 1 })
              .first({ fallback: () => null }),
          );

          if (viewMember) {
            const viewNodeId = viewMember.nodeId as Id.Node;
            const viewName = Yjs.getText(viewNodeId).toString() || "View";

            viewInfos.push({
              id: viewNodeId,
              name: viewName,
            });
          }
        }
      }

      setViews(viewInfos);
    });

    runtime.runPromise(loadViews);
  });

  const handleTabClick = (viewId: Id.Node) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;

        const bufferDoc = yield* Store.getDocument("buffer", bufferId());
        if (Option.isNone(bufferDoc)) return;

        const currentBuffer = Option.getOrThrow(bufferDoc);

        yield* Store.setDocument(
          "buffer",
          {
            ...currentBuffer,
            activeViewId: viewId,
          },
          bufferId(),
        );
      }),
    );
  };

  return (
    <Show when={views().length >= 2}>
      <div
        data-testid="view-tabs"
        class="mx-auto max-w-[var(--max-line-width)] w-full flex gap-1 border-b border-foreground-lighter mb-2"
      >
        <For each={views()}>
          {(view) => (
            <button
              data-testid="view-tab"
              data-active={view.id === activeViewId() ? "true" : undefined}
              class={`px-3 py-1.5 text-sm rounded-t transition-colors ${
                view.id === activeViewId()
                  ? "bg-foreground-lighter/20 border-b-2 border-foreground font-medium"
                  : "hover:bg-foreground-lighter/10 text-foreground-light"
              }`}
              onClick={() => handleTabClick(view.id)}
            >
              {view.name}
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
