import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Option, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import TextEditor, { EnterKeyInfo } from "./TextEditor";

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

  const handleEnter = (info: EnterKeyInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const [bufferId, nodeId] = yield* Id.parseBlockId(blockId);
        const Node = yield* NodeT;
        const Window = yield* WindowT;

        // Get parent of current node
        const parentId = yield* Node.getParent(nodeId);

        // Create new sibling after current node with textAfter content
        const newNodeId = yield* Node.insertNode({
          parentId,
          insert: "after",
          siblingId: nodeId,
          textContent: info.textAfter,
        });

        // Update current node text to textBefore
        yield* Node.setNodeText(nodeId, info.textBefore);

        // Focus the new block
        const newBlockId = Id.makeBlockId(bufferId, newNodeId);
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: newBlockId }),
        );
      }).pipe(
        Effect.catchTag(
          "NodeHasNoParentError",
          () =>
            // Root nodes can't be split - do nothing
            Effect.void,
        ),
      ),
    );
  };

  return (
    <div data-element-id={blockId} data-element-type="block">
      <div onClick={handleFocus}>
        <Show
          when={store.isActive}
          fallback={
            <p class="text-[length:var(--text-block)] leading-[var(--text-block--line-height)]">
              {store.textContent}
            </p>
          }
        >
          <TextEditor
            initialText={store.textContent}
            onChange={handleTextChange}
            onEnter={handleEnter}
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
