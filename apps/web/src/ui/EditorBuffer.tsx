import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Option, Stream } from "effect";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
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

  // Track if we're in block selection mode (activeElement.type === "buffer")
  const [isBlockSelectionMode, setIsBlockSelectionMode] = createSignal(false);

  onMount(() => {
    const dispose = start(runtime);

    // Subscribe to activeElement to know when we're in block selection mode
    const activeElementFiber = runtime.runFork(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        const stream = yield* Window.subscribeActiveElement();
        yield* Stream.runForEach(stream, (activeElement) =>
          Effect.sync(() => {
            const isBufferActive = Option.match(activeElement, {
              onNone: () => false,
              onSome: (el) => el.type === "buffer" && el.id === bufferId,
            });
            setIsBlockSelectionMode(isBufferActive);
          }),
        );
      }),
    );

    // Handle Escape key when in block selection mode
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if event came from inside CodeMirror - it has its own Escape handler
      const target = e.target as HTMLElement;
      if (target.closest(".cm-editor")) {
        return;
      }

      if (e.key === "Escape" && isBlockSelectionMode()) {
        e.preventDefault();
        runtime.runPromise(
          Effect.gen(function* () {
            const Window = yield* WindowT;
            const Buffer = yield* BufferT;
            const Store = yield* StoreT;

            // Get current lastFocusedBlockId to preserve it
            const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
              Effect.orDie,
            );
            const lastFocusedBlockId = Option.match(bufferDoc, {
              onNone: () => null,
              onSome: (buf) => buf.lastFocusedBlockId,
            });

            // Clear selection but preserve lastFocusedBlockId
            if (lastFocusedBlockId) {
              yield* Buffer.setBlockSelection(bufferId, [], lastFocusedBlockId);
            }
            yield* Window.setActiveElement(Option.none());
          }),
        );
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      dispose();
      runtime.runFork(Fiber.interrupt(activeElementFiber));
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  const handleClickZone = (_e: MouseEvent, nodeId: Id.Node) => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Yjs = yield* YjsT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const children = yield* Node.getNodeChildren(nodeId);
        const lastChildId =
          children.length > 0 ? children[children.length - 1] : null;

        let targetNodeId: Id.Node;
        let targetBlockId: Id.Block;

        if (lastChildId) {
          const lastChildText = Yjs.getText(lastChildId).toString();
          if (lastChildText === "") {
            targetNodeId = lastChildId;
            targetBlockId = Id.makeBlockId(bufferId, lastChildId);
          } else {
            targetNodeId = yield* Node.insertNode({
              parentId: nodeId,
              insert: "after",
            });
            targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
          }
        } else {
          targetNodeId = yield* Node.insertNode({
            parentId: nodeId,
            insert: "after",
          });
          targetBlockId = Id.makeBlockId(bufferId, targetNodeId);
        }

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId: targetNodeId },
            anchorOffset: 0,
            focus: { nodeId: targetNodeId },
            focusOffset: 0,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: targetBlockId }),
        );
      }),
    );
  };

  return (
    <div data-testid="editor-buffer" class="h-full flex flex-col">
      <Show when={store.nodeId} keyed>
        {(nodeId) => (
          <>
            <header class="mx-auto max-w-[var(--max-line-width)] w-full border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
              <Title bufferId={bufferId} nodeId={nodeId} />
            </header>
            <div data-testid="editor-body" class="flex-1 flex flex-col pt-4">
              <div class="mx-auto max-w-[var(--max-line-width)] w-full">
                <For each={store.childBlockIds}>
                  {(childId) => <Block blockId={childId} />}
                </For>
              </div>
              <div
                data-testid="editor-click-zone"
                class="flex-1 cursor-text"
                onClick={(e) => handleClickZone(e, nodeId)}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
