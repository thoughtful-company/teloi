import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";
import Title from "./Title";

interface EditorBufferProps {
  bufferId: Id.Buffer;
}

export default function EditorBuffer({ bufferId }: EditorBufferProps) {
  const runtime = useBrowserRuntime();

  const bufferStream = Stream.unwrap(
    Effect.gen(function* () {
      const Buffer = yield* BufferT;
      return yield* Buffer.subscribe(bufferId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: bufferStream,
    project: (v) => ({
      nodeId: Id.Node.make(v.nodeData.id),
      childBlockIds: v.childBlockIds.map((childId) =>
        Id.makeBlockId(bufferId, Id.Node.make(childId)),
      ),
    }),
    initial: {
      nodeId: null as Id.Node | null,
      childBlockIds: [] as Id.Block[],
    },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(dispose);
  });

  return (
    <div data-testid="editor-buffer">
      <Show when={store.nodeId}>
        {(nodeId) => (
          <>
            <header class="mx-auto max-w-[var(--max-line-width)] border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
              <Title bufferId={bufferId} nodeId={nodeId()} />
            </header>
            <div class="mx-auto max-w-[var(--max-line-width)] flex flex-col pt-4">
              <For each={store.childBlockIds}>
                {(childId) => <Block blockId={childId} />}
              </For>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
