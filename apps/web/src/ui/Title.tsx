import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Option, Stream } from "effect";
import { onCleanup, onMount, Show } from "solid-js";
import TextEditor from "./TextEditor";

interface TitleProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

export default function Title({ bufferId, nodeId }: TitleProps) {
  const runtime = useBrowserRuntime();

  const titleStream = Stream.unwrap(
    Effect.gen(function* () {
      const Node = yield* NodeT;
      const Window = yield* WindowT;

      const nodeStream = yield* Node.subscribe(nodeId);
      const activeElementStream = yield* Window.subscribeActiveElement();

      const isActiveStream = activeElementStream.pipe(
        Stream.map((maybeActive) =>
          Option.match(maybeActive, {
            onNone: () => false,
            onSome: (el) =>
              el.type === "title" && el.bufferId === bufferId,
          }),
        ),
        Stream.changesWith((a, b) => a === b),
      );

      return Stream.zipLatestWith(
        nodeStream,
        isActiveStream,
        (nodeData, isActive) => ({ textContent: nodeData.textContent, isActive }),
      );
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: titleStream,
    project: (v) => v,
    initial: {
      textContent: "",
      isActive: false,
    },
  });

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(dispose);
  });

  let clickCoords: { x: number; y: number } | null = null;

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        yield* Window.setActiveElement(
          Option.some({ type: "title" as const, bufferId }),
        );
      }),
    );
  };

  const handleTextChange = (text: string) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        yield* Node.setNodeText(nodeId, text);
      }),
    );
  };

  return (
    <div onClick={handleFocus}>
      <Show
        when={store.isActive}
        fallback={
          <h1 class="text-title leading-[var(--text-title--line-height)] font-semibold">
            {store.textContent}
          </h1>
        }
      >
        <TextEditor
          initialText={store.textContent}
          onChange={handleTextChange}
          initialClickCoords={clickCoords}
          variant="title"
        />
      </Show>
    </div>
  );
}
