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

/**
 * Render the editor UI for a single buffer.
 *
 * Subscribes to the buffer identified by `bufferId`, binds its updates to local state, and renders
 * the buffer header (Title) and a list of child Block components when a root node is present.
 *
 * @param bufferId - Identifier of the buffer to subscribe to and render
 * @returns The component's JSX element; an outer container that conditionally renders a header with a Title and a column of Block components for the buffer's child blocks when the buffer's root node is available
 */
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
      <Show when={store.nodeId} keyed>
        {(nodeId) => (
          <>
            <header class="mx-auto max-w-[var(--max-line-width)] border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
              <Title bufferId={bufferId} nodeId={nodeId} />
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