import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { TypeT } from "@/services/domain/Type";
import { YjsT } from "@/services/external/Yjs";
import { NavigationT } from "@/services/ui/Navigation";
import { TypeColorT, TypeColors } from "@/services/ui/TypeColor";
import { DEFAULT_COLORS } from "@/services/ui/TypeColor/types";
import { Badge } from "@kobalte/core/badge";
import { Effect, Stream } from "effect";
import { createSignal, onCleanup, onMount } from "solid-js";

interface TypeBadgeProps {
  typeId: Id.Node;
  nodeId: Id.Node;
  onRemove?: () => void;
}

export default function TypeBadge({
  typeId,
  nodeId,
  onRemove,
}: TypeBadgeProps) {
  const runtime = useBrowserRuntime();
  const [name, setName] = createSignal("");
  const [colors, setColors] = createSignal<TypeColors>(DEFAULT_COLORS);

  onMount(() => {
    const Yjs = runtime.runSync(YjsT);
    const ytext = Yjs.getText(typeId);
    setName(ytext.toString());

    const observer = () => setName(ytext.toString());
    ytext.observe(observer);

    // Subscribe to color changes
    const colorAbortController = new AbortController();
    runtime.runPromise(
      Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        const colorStream = yield* TypeColor.subscribeColors(typeId);

        yield* colorStream.pipe(
          Stream.runForEach((newColors) =>
            Effect.sync(() => setColors(newColors)),
          ),
        );
      }),
      { signal: colorAbortController.signal },
    );

    onCleanup(() => {
      ytext.unobserve(observer);
      colorAbortController.abort();
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

  const handleNavigate = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(
      Effect.gen(function* () {
        const Navigation = yield* NavigationT;
        yield* Navigation.navigateTo(typeId);
      }),
    );
  };

  return (
    <Badge
      textValue={`Type: ${name()}`}
      class="group inline-flex items-baseline text-xs whitespace-nowrap rounded hover:bg-transparent cursor-pointer"
      style={{
        "background-color": colors().bg,
        color: colors().fg,
      }}
    >
      <button
        onClick={handleRemove}
        class="pl-1 pr-0.5 opacity-60 group-hover:opacity-100 hover:text-red-500 cursor-pointer"
      >
        <span class="group-hover:hidden inline-block w-2 max-w-2 text-center">#</span>
        <svg
          viewBox="6 6 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="hidden group-hover:block w-2 h-2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <button
        onClick={handleNavigate}
        class="pr-1 pl-0.5 rounded group-hover:shadow-sm cursor-pointer"
        style={{
          "background-color": colors().bg,
          color: colors().fg,
        }}
      >
        {name()}
      </button>
    </Badge>
  );
}
