import { tables } from "@/livestore/schema";
import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import Khora from "./Khora";

interface PageViewProps {
  frameId: Id.Frame;
  nodeId: Id.Node;
  inline?: boolean;
}

export default function PageView(props: PageViewProps) {
  const runtime = useBrowserRuntime();

  const childrenStream = Stream.unwrap(
    Effect.gen(function* () {
      const Node = yield* NodeT;
      return yield* Node.subscribeChildren(props.nodeId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: childrenStream,
    project: (childIds) => ({
      childKhoraIds: childIds.map((id) =>
        Id.makeFrameKhoraId(props.frameId, Id.Node.make(id)),
      ),
    }),
    initial: { childKhoraIds: [] as Id.Khora[] },
  });

  const blockDocStream = Stream.unwrap(
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const khoraId = Id.makeFrameKhoraId(props.frameId, props.nodeId);
      return yield* Store.subscribeStream(
        queryDb(
          tables.khora
            .select("value")
            .where("id", "=", khoraId)
            .first({ fallback: () => null }),
        ),
      );
    }),
  );

  const { store: ghostStore, start: startGhost } = bindStreamToStore({
    stream: blockDocStream,
    project: (blockValue) => ({
      ghostChildId: (blockValue?.ghostChildId ?? null) as Id.Node | null,
    }),
    initial: { ghostChildId: null as Id.Node | null },
  });

  const allBlockIds = () => {
    const children = store.childKhoraIds;
    const ghostId = ghostStore.ghostChildId;
    if (children.length === 0 && ghostId) {
      return [Id.makeFrameKhoraId(props.frameId, ghostId)];
    }
    return children;
  };

  onMount(() => {
    const dispose = start(runtime);
    const disposeGhost = startGhost(runtime);
    onCleanup(() => {
      dispose();
      disposeGhost();
    });
  });

  return (
    <div
      data-testid="editor-body"
      class="flex flex-col"
      classList={{ "flex-1 pt-4": !props.inline }}
    >
      <div class="mx-auto flex flex-col gap-1.5 max-w-[var(--max-line-width)] w-full">
        <For each={allBlockIds()}>
          {(childId) => <Khora khoraId={childId} />}
        </For>
      </div>
      <Show when={!props.inline}>
        <div
          data-testid="editor-click-zone"
          class="flex-1 min-h-[25vh] cursor-text"
        />
      </Show>
    </div>
  );
}
