import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { posAtCoordsInElement } from "@/services/browser/TextBlock";
import { AutomergeT } from "@/services/external/Automerge";
import { AppAction, createDispatch } from "@/services/ui/Action";
import { BlockT, type BlockView } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { For, onCleanup, onMount, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import { FormattedText } from "./FormattedText";
import Editor from "./Editor";
import TypeBadge from "./TypeBadge";

interface BlockProps {
  blockId: Id.Block;
}

/**
 * Renders an editable hierarchical block and keeps it synchronized with the application runtime and Automerge document state.
 *
 * The component displays read-only text when inactive and a rich text editor when active; it manages focus, selection, document stream subscription, Automerge text observation, and user editing/navigation behaviors (split/merge, indent/outdent, arrow navigation, zoom) for the given block.
 *
 * @param blockId - The block identifier to render and synchronize (Id.Block)
 * @returns The block's rendered TSX element containing the editor or read-only view and its child blocks
 */
export default function Block({ blockId }: BlockProps) {
  const runtime = useBrowserRuntime();

  const blockContext = Id.parseBlockContextSync(blockId);
  // TODO: tuple case should be resolved in ViewModel, not here
  const nodeId =
    blockContext.type === "buffer"
      ? blockContext.nodeId
      : blockContext.hostNodeId; // section or tuple case

  // AutomergeT for handle access
  const Automerge = runtime.runSync(AutomergeT);

  // Block state stream (BlockT.subscribe composes all streams internally)
  const blockStream = Stream.unwrap(
    Effect.gen(function* () {
      const Block = yield* BlockT;
      return yield* Block.subscribe(blockId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: blockStream,
    project: (v) => v,
    initial: {
      nodeData: { id: "" as Id.Node, createdAt: 0, modifiedAt: 0 },
      childBlockIds: [],
      isActive: false,
      isSelected: false,
      isExpanded: true,
      selection: null,
      activeTypes: [],
      userTypes: [],
      textContent: "",
      picker: null,
    } satisfies BlockView,
  });

  const getActiveDefinitions = () =>
    store.activeTypes
      .map(BlockType.get)
      .filter((d): d is BlockType.BlockTypeDefinition => d != null);

  const getPrimaryDecoration = () => {
    for (const def of getActiveDefinitions()) {
      if (def.renderDecoration) return def.renderDecoration;
    }
    return null;
  };

  onMount(() => {
    const dispose = start(runtime);
    onCleanup(() => dispose());
  });

  const hasChildren = () => store.childBlockIds.length > 0;

  // TODO: These handlers should be passed as props from a container/ViewModel
  const handleToggleExpand = (_e: MouseEvent) => {};

  // Ref to p element for click position resolution
  let pRef: HTMLParagraphElement | undefined;

  const dispatch = createDispatch(runtime);

  // Handle mousedown to focus block (mousedown enables drag-to-select)
  const handleMouseDown = (e: MouseEvent) => {
    if (store.isActive) return;

    // Resolve click position for buffer-type blocks
    let offset: number | undefined;
    let assoc: 1 | -1 | undefined;
    if (pRef && blockContext.type === "buffer") {
      const resolved = posAtCoordsInElement(pRef, e.clientX, e.clientY);
      offset = resolved?.offset;
      assoc = resolved?.assoc;
    }

    dispatch(AppAction.Focus(blockId, offset, assoc));
  };

  return (
    <div data-element-id={blockId} data-element-type="block" class="relative">
      <Show when={hasChildren()}>
        <button
          type="button"
          class="absolute -left-5 top-[calc((var(--text-block)*var(--text-block--line-height)-var(--text-block))/2)] w-5 h-[var(--text-block)] flex items-center justify-center select-none"
          onClick={handleToggleExpand}
          tabIndex={-1}
        >
          <span
            class="block w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[6px] border-l-gray-400 hover:border-l-gray-600"
            classList={{
              "rotate-90": store.isExpanded,
            }}
          />
        </button>
      </Show>
      <div
        onMouseDown={handleMouseDown}
        data-block-content
        class="flex"
        classList={{
          "ring-2 ring-inset ring-selection-ring bg-selection-bg rounded":
            store.isSelected,
        }}
      >
        <Transition
          enterActiveClass="transition-all duration-150 ease-out"
          enterClass="opacity-0 scale-0"
          enterToClass="opacity-100 scale-100"
          exitActiveClass="transition-all duration-150 ease-in"
          exitClass="w-4 opacity-100 scale-100"
          exitToClass="w-0 opacity-0 scale-0"
        >
          <Show when={getPrimaryDecoration()}>
            {(renderDecoration) => (
              <span class="w-4 shrink-0 pt-[calc((var(--text-block)*var(--text-block--line-height)-var(--text-block))/2+var(--text-block)*0.025)] mr-1 select-none origin-center overflow-hidden">
                {renderDecoration()({ nodeId })}
              </span>
            )}
          </Show>
        </Transition>
        <div class="flex-1 min-w-0">
          <Show
            when={store.isActive}
            fallback={
              <p
                ref={pRef}
                class="font-[family-name:var(--font-sans)] text-[length:var(--text-block)] leading-[var(--text-block--line-height)] min-h-[var(--text-block--line-height)] whitespace-break-spaces"
              >
                <Show when={store.textContent} fallback={"\u00A0"}>
                  <FormattedText text={store.textContent} />
                </Show>
                <Show when={store.userTypes.length > 0}>
                  <span class="inline-flex gap-[var(--type-badge-spacing)] ml-[var(--inline-type-gap)]">
                    <For each={store.userTypes}>
                      {(typeId) => (
                        <TypeBadge typeId={typeId} nodeId={nodeId} />
                      )}
                    </For>
                  </span>
                </Show>
              </p>
            }
          >
            <Editor
              handle={Automerge.handle}
              path={Automerge.getTextPath(nodeId)}
              blockId={blockId}
              {...(store.selection
                ? { initialSelection: store.selection }
                : {})}
            />
          </Show>
        </div>
      </div>
      <Show when={store.isExpanded}>
        <div
          class="pl-4 flex flex-col gap-1.5"
          classList={{
            "bg-selection-children-bg rounded-b": store.isSelected,
          }}
        >
          <Show when={store.childBlockIds.length > 0}>
            <div class="w-max h-0"> </div>
          </Show>
          <For each={store.childBlockIds}>
            {(childId) => <Block blockId={childId} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
