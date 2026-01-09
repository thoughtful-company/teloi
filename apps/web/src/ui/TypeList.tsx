import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { isSystemType } from "@/services/ui/TypePicker";
import { Effect, Fiber, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import TypeBadge from "./TypeBadge";

interface TypeListProps {
  nodeId: Id.Node;
}

export default function TypeList({ nodeId }: TypeListProps) {
  const runtime = useBrowserRuntime();
  const [types, setTypes] = createSignal<readonly Id.Node[]>([]);

  // Filter out system types
  const userTypes = () => types().filter((typeId) => !isSystemType(typeId));

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        const stream = yield* Type.subscribeTypes(nodeId);
        yield* Stream.runForEach(stream, (typeIds) =>
          Effect.sync(() => setTypes(typeIds)),
        );
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber));
    });
  });

  return (
    <Show when={userTypes().length > 0}>
      <div class="flex flex-wrap gap-1.5 mt-2">
        <For each={userTypes()}>
          {(typeId) => <TypeBadge typeId={typeId} nodeId={nodeId} />}
        </For>
      </div>
    </Show>
  );
}
