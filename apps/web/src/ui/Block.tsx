import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Option, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import TextEditor from "./TextEditor";

interface BlockProps {
  blockId: Id.Block;
}

export default function Block({ blockId }: BlockProps) {
  const runtime = useBrowserRuntime();

  // Lazy block creation: if block doesn't exist, create it then subscribe
  const blockStreamEffect = Effect.gen(function* () {
    const Block = yield* BlockT;
    const Store = yield* StoreT;

    return yield* Block.subscribe(blockId).pipe(
      Effect.catchTag("BlockNotFoundError", () =>
        Effect.gen(function* () {
          yield* Store.setDocument(
            "block",
            {
              isSelected: false,
              isToggled: false,
            },
            blockId,
          );

          return yield* Block.subscribe(blockId);
        }),
      ),
      Effect.catchTag("NodeNotFoundError", (err) =>
        Effect.dieMessage(err.toString()),
      ),
    );
  });

  const blockStream = Stream.unwrap(blockStreamEffect);

  const { store, start } = bindStreamToStore({
    stream: blockStream,
    project: (view) => ({
      textContent: view.nodeData.textContent,
      isActive: view.isActive,
      childBlockIds: view.childBlockIds,
    }),
    initial: {
      textContent: "",
      isActive: false,
      childBlockIds: [] as readonly Id.Block[],
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
          Option.some({ type: "block" as const, id: blockId }),
        );
      }),
    );
  };

  const handleTextChange = (text: string) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        yield* Node.setNodeText(nodeId, text);
      }),
    );
  };

  return (
    <div>
      <div onClick={handleFocus}>
        <Show
          when={store.isActive}
          fallback={
            <p class="text-[16px] leading-[1.4]">{store.textContent}</p>
          }
        >
          <TextEditor
            initialText={store.textContent}
            onChange={handleTextChange}
            initialClickCoords={clickCoords}
          />
        </Show>
      </div>
      <div class="pl-4">
        <For each={store.childBlockIds}>
          {(childId) => <Block blockId={childId} />}
        </For>
      </div>
    </div>
  );
}
