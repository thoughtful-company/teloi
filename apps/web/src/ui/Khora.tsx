import { Collapse, Expand } from "@/commands/frame";
import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { posAtCoordsInElement } from "@/services/browser/TextBlock";
import { AutomergeT } from "@/services/external/Automerge";
import {
  KhoraT,
  resolveEffectiveActiveViewId,
  type KhoraView,
} from "@/services/ui/Khora";
import * as BlockType from "@/services/ui/BlockType";
import { CommandBusT } from "@/services/ui/CommandBus";
import { propertyTrigger } from "@/services/ui/Property/trigger";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Stream } from "effect";
import {
  createEffect,
  createMemo,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Transition } from "solid-transition-group";
import Editor from "./Editor";
import { focusKhora } from "./focusKhora";
import { FormattedText } from "./FormattedText";
import TypeBadge from "./TypeBadge";
import ViewRenderer from "./ViewRenderer";
import ViewTabs from "./ViewTabs";

interface KhoraProps {
  khoraId: Id.Khora;
}

export default function Khora({ khoraId }: KhoraProps) {
  const runtime = useBrowserRuntime();

  const blockContext = Id.parseKhoraContextSync(khoraId);
  const fallbackNodeId = ((): Id.Node => {
    switch (blockContext.type) {
      case "frame":
        return blockContext.nodeId;
      case "section":
        return blockContext.hostNodeId;
      case "propertyTitle":
        return blockContext.propertyId;
    }
  })();
  const frameId = blockContext.frameId;
  const isFrameKhora = blockContext.type === "frame";
  const isPropertyTitle = blockContext.type === "propertyTitle";

  const Automerge = runtime.runSync(AutomergeT);

  const blockStream = Stream.unwrap(
    Effect.gen(function* () {
      const Khora = yield* KhoraT;
      return yield* Khora.subscribe(khoraId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: blockStream,
    project: (v) => v,
    initial: {
      nodeData: { id: fallbackNodeId, createdAt: 0, modifiedAt: 0 },
      isActive: false,
      isSelected: false,
      isExpanded: false,
      selection: null,
      activeViewId: null,
      activeViewType: "page",
      availableViews: [],
      activeTypes: [],
      userTypes: [],
      textContent: "",
      picker: null,
      childCount: 0,
      ghostChildId: null,
      ghostParentId: null,
    } satisfies KhoraView,
  });

  const nodeId = (): Id.Node =>
    store.nodeData.id ? Id.Node.make(store.nodeData.id) : fallbackNodeId;

  const effectiveActiveViewId = createMemo(() =>
    resolveEffectiveActiveViewId(store.activeViewId, store.availableViews),
  );

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

  // Materialization only applies to frame ghosts because section/property-title
  // khoras do not own tree structure in LiveStore.
  createEffect(() => {
    if (!isFrameKhora) return;
    const ghostParentId = store.ghostParentId;
    if (!ghostParentId) return;

    let materialized = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onChange = () => {
      if (materialized) return;
      runtime.runPromise(Automerge.getText(nodeId())).then((text) => {
        if (text.length > 0 && !materialized) {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(() => {
            if (!materialized) {
              materialized = true;
              runtime.runPromise(
                Effect.gen(function* () {
                  const Khora = yield* KhoraT;
                  yield* Khora.materialize({
                    ghostNodeId: nodeId(),
                    parentNodeId: ghostParentId,
                    frameId,
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

  const toTextOffset = (
    container: HTMLElement,
    node: Node,
    offset: number,
  ): number | null => {
    if (!container.contains(node)) return null;
    const range = document.createRange();
    range.selectNodeContents(container);
    range.setEnd(node, offset);
    return range.toString().length;
  };

  const resolveInitialSelection = (
    container: HTMLElement,
    e: MouseEvent,
  ): { anchor: number; head: number; assoc: -1 | 0 | 1 } => {
    const domSelection = window.getSelection();
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      domSelection.anchorNode &&
      domSelection.focusNode &&
      container.contains(domSelection.anchorNode) &&
      container.contains(domSelection.focusNode)
    ) {
      const anchor = toTextOffset(
        container,
        domSelection.anchorNode,
        domSelection.anchorOffset,
      );
      const head = toTextOffset(
        container,
        domSelection.focusNode,
        domSelection.focusOffset,
      );
      if (anchor != null && head != null) {
        if (anchor === head) {
          const resolved = posAtCoordsInElement(
            container,
            e.clientX,
            e.clientY,
          );
          return { anchor, head, assoc: resolved?.assoc ?? 0 };
        }
        return { anchor, head, assoc: 0 };
      }
    }

    const resolved = posAtCoordsInElement(container, e.clientX, e.clientY);
    const offset = resolved?.offset ?? 0;
    return { anchor: offset, head: offset, assoc: resolved?.assoc ?? 0 };
  };

  const handleClick = (e: MouseEvent) => {
    if (store.isActive) return;
    if (!pRef) return;

    const initialSelection = resolveInitialSelection(pRef, e);

    runtime.runSync(
      focusKhora({
        frameId,
        nodeId: nodeId(),
        khoraId,
        anchor: initialSelection.anchor,
        head: initialSelection.head,
        assoc: initialSelection.assoc,
      }),
    );
  };

  return (
    <div data-element-id={khoraId} data-element-type="khora" class="relative">
      <Show when={isFrameKhora}>
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
      </Show>
      <div
        onClick={handleClick}
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
                {renderDecoration()({ nodeId: nodeId() })}
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
                <Show when={!isPropertyTitle && store.userTypes.length > 0}>
                  <span class="inline-flex gap-[var(--type-badge-spacing)] ml-[var(--inline-type-gap)]">
                    <For each={store.userTypes}>
                      {(typeId) => (
                        <TypeBadge typeId={typeId} nodeId={nodeId()} />
                      )}
                    </For>
                  </span>
                </Show>
              </p>
            }
          >
            <Editor
              handle={Automerge.handle}
              path={Automerge.getTextPath(nodeId())}
              khoraId={khoraId}
              inlineTypes={isPropertyTitle ? [] : store.userTypes}
              nodeId={nodeId()}
              textTriggers={[propertyTrigger]}
              {...(store.selection
                ? { initialSelection: store.selection }
                : {})}
            />
          </Show>
        </div>
      </div>
      <Show when={isFrameKhora && store.isExpanded}>
        <div
          class="pl-4 flex flex-col gap-1.5"
          classList={{
            "bg-selection-children-bg rounded-b": store.isSelected,
          }}
        >
          <ViewTabs
            availableViews={store.availableViews}
            activeViewId={effectiveActiveViewId()}
            onTabClick={(viewId) => {
              runtime.runPromise(
                Effect.gen(function* () {
                  const Khora = yield* KhoraT;
                  yield* Khora.setActiveView(khoraId, viewId);
                }),
              );
            }}
          />
          <ViewRenderer
            viewType={store.activeViewType}
            frameId={frameId}
            nodeId={nodeId()}
            inline
          />
        </div>
      </Show>
    </div>
  );
}
