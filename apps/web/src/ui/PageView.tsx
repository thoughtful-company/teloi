import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { For, onCleanup, onMount } from "solid-js";
import Block from "./Block";

interface PageViewProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
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
      childBlockIds: childIds.map((id) =>
        Id.makeBufferBlockId(props.bufferId, Id.Node.make(id)),
      ),
    }),
    initial: { childBlockIds: [] as Id.Block[] },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(() => dispose());
  });

  return (
    <div data-testid="editor-body" class="flex-1 flex flex-col pt-4">
      <div class="mx-auto flex flex-col gap-1.5 max-w-[var(--max-line-width)] w-full">
        <For each={store.childBlockIds}>
          {(childId) => <Block blockId={childId} />}
        </For>
      </div>
      <div
        data-testid="editor-click-zone"
        class="flex-1 min-h-[25vh] cursor-text"
      />
    </div>
  );
}
