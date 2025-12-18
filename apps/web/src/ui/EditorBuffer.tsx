import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { onCleanup, onMount, Show } from "solid-js";
import Block from "./Block";

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
      rootBlockId: Id.makeBlockId(bufferId, Id.Node.make(v.nodeData.id)),
    }),
    initial: {
      rootBlockId: null as Id.Block | null,
    },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(dispose);
  });

  return (
    <Show when={store.rootBlockId}>
      {(blockId) => <Block blockId={blockId()} />}
    </Show>
  );
}
