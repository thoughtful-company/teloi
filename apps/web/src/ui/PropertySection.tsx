import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { PropertyT, type LinkedTuple } from "@/services/ui/Property";
import { Effect, Fiber, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import Khora from "./Khora";

interface PropertySectionProps {
  propertyId: Id.Node;
  pageId: Id.Node;
  frameId: Id.Frame;
}

/**
 * PropertySection displays an editable property with its name and linked blocks.
 *
 * Linked blocks are tuple-backed khoras, not outline children, so this component
 * subscribes to tuple instances directly instead of relying on outline updates.
 */
export default function PropertySection(props: PropertySectionProps) {
  const runtime = useBrowserRuntime();
  const [linkedTuples, setLinkedTuples] = createSignal<readonly LinkedTuple[]>(
    [],
  );

  const titleKhoraId = Id.makePropertyTitleKhoraId(
    props.frameId,
    props.pageId,
    props.propertyId,
  );

  const makePropertyKhoraId = (tupleId: Id.Tuple) =>
    Id.makePropertyKhoraId(
      props.frameId,
      props.pageId,
      props.propertyId,
      tupleId,
    );

  onMount(() => {
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const Property = yield* PropertyT;
        const tuplesStream = yield* Property.subscribeLinkedTuples(
          props.propertyId,
          props.pageId,
        );

        yield* Stream.runForEach(tuplesStream, (tuples) =>
          Effect.sync(() => setLinkedTuples([...tuples])),
        );
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber));
    });
  });

  return (
    <div
      data-testid="property-section"
      class="flex items-stretch gap-3 py-1.5 text-sm"
    >
      <div class="flex items-center gap-2 min-w-[120px]">
        <span class="text-neutral-400 select-none">›</span>
        <div class="property-name flex-1">
          <Khora khoraId={titleKhoraId} />
        </div>
      </div>

      <div class="w-px bg-neutral-200 self-stretch" />

      <div data-testid="linked-blocks" class="flex flex-col gap-1 flex-1">
        <Show
          when={linkedTuples().length > 0}
          fallback={
            <span class="text-neutral-400 italic">no linked items</span>
          }
        >
          <For each={linkedTuples()}>
            {(tuple) => <Khora khoraId={makePropertyKhoraId(tuple.tupleId)} />}
          </For>
        </Show>
      </div>
    </div>
  );
}
