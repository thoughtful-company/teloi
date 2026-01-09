import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { YjsT } from "@/services/external/Yjs";
import { Badge } from "@kobalte/core/badge";
import { Effect } from "effect";
import { createSignal, onCleanup, onMount } from "solid-js";

interface TypeBadgeProps {
  typeId: Id.Node;
  nodeId: Id.Node;
  onRemove?: () => void;
}

export default function TypeBadge({ typeId, nodeId, onRemove }: TypeBadgeProps) {
  const runtime = useBrowserRuntime();
  const [name, setName] = createSignal("");

  onMount(() => {
    const Yjs = runtime.runSync(YjsT);
    const ytext = Yjs.getText(typeId);
    setName(ytext.toString());

    const observer = () => setName(ytext.toString());
    ytext.observe(observer);

    onCleanup(() => {
      ytext.unobserve(observer);
    });
  });

  const handleRemove = (e: MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove();
    } else {
      runtime.runPromise(
        Effect.gen(function* () {
          const Type = yield* TypeT;
          yield* Type.removeType(nodeId, typeId);
        }),
      );
    }
  };

  return (
    <Badge
      textValue={`Type: ${name()}`}
      class="group inline-flex items-center gap-1 px-2 py-0.5 bg-sidebar-accent/80 text-sidebar-foreground text-xs rounded-full whitespace-nowrap"
    >
      <span class="opacity-60">#</span>
      <span>{name()}</span>
      <button
        onClick={handleRemove}
        class="opacity-0 group-hover:opacity-60 hover:!opacity-100 -mr-1 w-4 h-4 flex items-center justify-center"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-3 h-3"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </Badge>
  );
}
