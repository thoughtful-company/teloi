import { Collapse, Expand } from "@/commands/buffer";
import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { posAtCoordsInElement } from "@/services/browser/TextBlock";
import { AutomergeT } from "@/services/external/Automerge";
import { BlockT, type BlockView } from "@/services/ui/Block";
import { CommandBusT } from "@/services/ui/CommandBus";
import type { ViewInfo } from "@/services/ui/View";
import * as BlockType from "@/services/ui/BlockType";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import { focusBlock } from "./focusBlock";
import { createEffect, For, onCleanup, onMount, Show } from "solid-js";
import { Transition } from "solid-transition-group";
import Editor from "./Editor";
import { FormattedText } from "./FormattedText";
import TypeBadge from "./TypeBadge";
import ViewRenderer from "./ViewRenderer";
import ViewTabs from "./ViewTabs";

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
  const bufferId =
    blockContext.type === "buffer" ? blockContext.bufferId : null;

  const Automerge = runtime.runSync(AutomergeT);

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
      isActive: false,
      isSelected: false,
      isExpanded: false,
      selection: null,
      activeViewId: null,
      activeViewType: "page" as const,
      availableViews: [] as ViewInfo[],
      activeTypes: [],
      userTypes: [],
      textContent: "",
      picker: null,
      childCount: 0,
      ghostChildId: null,
      ghostParentId: null,
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

  // Ghost materialization: when this block is a ghost, listen for the first
  // keystroke and convert it into a real LiveStore node.
  createEffect(() => {
    const ghostParentId = store.ghostParentId;
    if (!ghostParentId || !bufferId) return;

    let materialized = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onChange = () => {
      if (materialized) return;
      runtime.runPromise(Automerge.getText(nodeId)).then((text) => {
        if (text.length > 0 && !materialized) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            if (!materialized) {
              materialized = true;
              runtime.runPromise(
                Effect.gen(function* () {
                  const Block = yield* BlockT;
                  yield* Block.materialize({
                    ghostNodeId: nodeId,
                    parentNodeId: ghostParentId,
                    bufferId,
                  });
                }),
              );
            }
          }, 50);
        }
      });
    };

    Automerge.handle.on("change", onChange);

    onCleanup(() => {
      if (timeout) clearTimeout(timeout);
      Automerge.handle.off("change", onChange);
    });
  });

  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(
      Effect.gen(function* () {
        const CommandBus = yield* CommandBusT;
        yield* CommandBus.dispatch(
          store.isExpanded ? new Collapse() : new Expand(),
        );
      }),
    );
  };

  let pRef: HTMLParagraphElement | undefined;

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

    runtime.runSync(
      focusBlock({
        bufferId: blockContext.bufferId,
        nodeId,
        blockId,
        offset,
        assoc,
      }),
    );
  };

  return (
    <div data-element-id={blockId} data-element-type="block" class="relative">
      {/* Expand/collapse toggle */}
      <button
        type="button"
        class="absolute -left-5 top-[calc((var(--text-block)*var(--text-block--line-height)-var(--text-block))/2)] w-5 h-[var(--text-block)] flex items-center justify-center select-none transition-opacity"
        classList={{
          "opacity-0 hover:opacity-100":
            store.childCount === 0 && !store.ghostChildId,
        }}
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
                class="font-[family-name:var(--font-sans)] text-[length:var(--text-block)] leading-[var(--text-block--line-height)] min-h-[var(--text-block--line-height)] whitespace-break-spaces wrap-anywhere pl-[var(--block-padding-left)]"
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
              inlineTypes={store.userTypes}
              nodeId={nodeId}
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
          <ViewTabs
            availableViews={store.availableViews}
            activeViewId={store.activeViewId}
            onTabClick={(viewId) => {
              runtime.runPromise(
                Effect.gen(function* () {
                  const Block = yield* BlockT;
                  yield* Block.setActiveView(blockId, viewId);
                }),
              );
            }}
          />
          <ViewRenderer
            viewType={store.activeViewType}
            bufferId={blockContext.bufferId}
            nodeId={nodeId}
            inline
          />
        </div>
      </Show>
    </div>
  );
}
