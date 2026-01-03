import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Option, Stream } from "effect";
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

  const handleBodyClick = (e: MouseEvent, nodeId: Id.Node) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-element-type='block']")) return;

    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Yjs = yield* YjsT;
        const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        const children = yield* Node.getNodeChildren(nodeId);
        const lastChildId = children.length > 0 ? children[children.length - 1] : null;

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
            assoc: null,
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
            <div
              data-testid="editor-body"
              class="flex-1 flex flex-col pt-4 cursor-text"
              onClick={(e) => handleBodyClick(e, nodeId)}
            >
              <div class="mx-auto max-w-[var(--max-line-width)] w-full">
                <For each={store.childBlockIds}>
                  {(childId) => <Block blockId={childId} />}
                </For>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
