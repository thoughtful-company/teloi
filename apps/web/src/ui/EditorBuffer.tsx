import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { PickerT, type PickerState } from "@/services/ui/Picker";
import { WindowT } from "@/services/ui/Window";
import { ActionT, type AppAction, type DOMIntent } from "@/services/ui/Action";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { SCROLL_MARGIN, scrollElementIntoView } from "@/utils/scroll";
import { Effect, Fiber, Option, Stream } from "effect";
import {
  createContext,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Entity } from "@/schema";
import { PropertyT, type PropertyInfo } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import Block from "./Block";
import PropertySection from "./PropertySection";
import TableView from "./TableView";
import Title from "./Title";
import { TypePicker } from "./TypePicker";
import TypeList from "./TypeList";
import ViewTabs from "./ViewTabs";

const isMac = navigator.platform.toUpperCase().includes("MAC");

/** Context to expose activeElement to child components for scroll-on-mount behavior */
export const ActiveElementContext = createContext<() => Entity.Element | null>(
  () => null,
);

/** Context to expose picker state to Block/Title for query updates */
export const PickerStateContext = createContext<() => PickerState | null>(
  () => null,
);

function scrollBlockIntoView(blockId: Id.Block) {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-element-id="${blockId}"][data-element-type="block"] [data-block-content]`,
    );
    if (!el) return;
    scrollElementIntoView(el, SCROLL_MARGIN);
  });
}

/** Helper component to render properties for a page's view */
function PropertyList(props: { pageId: Id.Node; bufferId: Id.Buffer }) {
  const runtime = useBrowserRuntime();
  const [properties, setProperties] = createSignal<PropertyInfo[]>([]);

  onMount(() => {
    // Subscribe to views for the page, then subscribe to properties when a view exists
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const View = yield* ViewT;
        const Property = yield* PropertyT;

        // Subscribe to views for the page
        const viewsStream = yield* View.subscribeViewsForPage(props.pageId);

        // When views change, subscribe to properties of the first view
        yield* Stream.runForEach(
          Stream.flatMap(
            viewsStream,
            (viewIds): Stream.Stream<readonly PropertyInfo[]> => {
              if (viewIds.length === 0) {
                // No views yet - emit empty properties
                return Stream.succeed<readonly PropertyInfo[]>([]);
              }
              // Subscribe to properties of first view
              const viewId = viewIds[0]!;
              return Stream.unwrap(Property.subscribePropertiesForView(viewId));
            },
            { switch: true }, // Cancel previous subscription when views change
          ),
          (props_) => Effect.sync(() => setProperties([...props_])),
        );
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber));
    });
  });

  return (
    <Show when={properties().length > 0}>
      <div class="mx-auto max-w-[var(--max-line-width)] w-full py-2">
        <Index each={properties()}>
          {(prop) => (
            <PropertySection
              propertyId={prop().id}
              pageId={props.pageId}
              bufferId={props.bufferId}
            />
          )}
        </Index>
      </div>
    </Show>
  );
}

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
        Id.makeBufferBlockId(bufferId, Id.Node.make(childId)),
      ),
      activeViewId: v.activeViewId,
    }),
    initial: {
      nodeId: null as Id.Node | null,
      childBlockIds: [] as Id.Block[],
      activeViewId: null as Id.Node | null,
    },
  });

  const getChildNodeIds = () =>
    store.childBlockIds.map((blockId) => {
      const [, nodeId] = Id.parseBlockId(blockId).pipe(Effect.runSync);
      return nodeId;
    });

  const [isBlockSelectionMode, setIsBlockSelectionMode] = createSignal(false);
  const [activeElement, setActiveElement] = createSignal<Entity.Element | null>(
    null,
  );
  const [pickerState, setPickerState] = createSignal<PickerState | null>(null);

  // Filter picker state to only show when it belongs to this buffer
  const getPickerForBuffer = (): {
    state: PickerState;
    nodeId: Id.Node;
  } | null => {
    const state = pickerState();
    if (!state) return null;

    const blockContext = Id.parseBlockContextSync(state.elementId);
    // Only show picker if it belongs to this buffer
    if (blockContext.type === "buffer" && blockContext.bufferId === bufferId) {
      return { state, nodeId: blockContext.nodeId };
    }
    return null;
  };

  const handleTypePickerSelect = (typeId: Id.Node) => {
    runtime.runFork(
      Effect.gen(function* () {
        const Picker = yield* PickerT;
        yield* Picker.selectType(typeId);
      }),
    );
  };

  const handleTypePickerCreate = (name: string) => {
    runtime.runFork(
      Effect.gen(function* () {
        const Picker = yield* PickerT;
        yield* Picker.createAndSelectType(name);
      }),
    );
  };

  const handleTypePickerClose = () => {
    runtime.runSync(
      Effect.gen(function* () {
        const Picker = yield* PickerT;
        yield* Picker.close();
      }),
    );
  };

  onMount(() => {
    const dispose = start(runtime);

    const activeElementFiber = runtime.runFork(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;
        const Store = yield* StoreT;
        const stream = yield* Window.subscribeActiveElement();

        let wasBufferActive = false;

        yield* Stream.runForEach(stream, (activeEl) =>
          Effect.gen(function* () {
            // Update context signal for child components
            const elementValue = Option.getOrNull(activeEl);
            setActiveElement(elementValue);

            const isBufferActive = Option.match(activeEl, {
              onNone: () => false,
              onSome: (el) => el.type === "buffer" && el.id === bufferId,
            });

            // When transitioning OUT of block selection mode, clear selection
            if (wasBufferActive && !isBufferActive) {
              const bufferDoc = yield* Store.getDocument(
                "buffer",
                bufferId,
              ).pipe(Effect.orDie);
              const anchor = Option.match(bufferDoc, {
                onNone: () => null,
                onSome: (buf) => buf.blockSelectionAnchor,
              });

              if (anchor) {
                yield* Buffer.setBlockSelection(bufferId, [], anchor);
              }
            }

            wasBufferActive = isBufferActive;
            setIsBlockSelectionMode(isBufferActive);

            // Scroll block into view when navigating in text editing mode
            if (Option.isSome(activeEl) && activeEl.value.type === "block") {
              const [elBufferId] = yield* Id.parseBlockId(activeEl.value.id);
              if (elBufferId === bufferId) {
                scrollBlockIntoView(activeEl.value.id);
              }
            }
          }),
        );
      }),
    );

    /**
     * Execute DOMIntent from ActionT result.
     */
    const executeDOMIntent = (intent: DOMIntent) => {
      const { focus, scroll, blur } = intent;

      if (blur) {
        const activeEl = document.activeElement;
        if (activeEl instanceof HTMLElement) {
          activeEl.blur();
        }
      }

      if (focus) {
        if (focus.type === "title") {
          requestAnimationFrame(() => {
            const titleEl = document.querySelector<HTMLElement>(
              `[data-element-id="${CSS.escape(focus.bufferId)}"][data-element-type="title"] .cm-content`,
            );
            titleEl?.focus();
          });
        } else if (focus.type === "block") {
          requestAnimationFrame(() => {
            const blockEl = document.querySelector<HTMLElement>(
              `[data-element-id="${CSS.escape(focus.blockId)}"][data-element-type="block"] .cm-content`,
            );
            blockEl?.focus();
          });
        }
      }

      if (scroll) {
        scrollBlockIntoView(scroll);
      }
    };

    /**
     * Try routing a document-level keydown through ActionT.
     * Returns true if ActionT handled it, false otherwise.
     */
    const tryActionTDocumentKeyDown = (e: KeyboardEvent): boolean => {
      // Only try for block selection mode
      if (!isBlockSelectionMode()) return false;

      // Only try for keys that ActionT handles in document mode
      const actionTHandledKeys = new Set([
        "Enter",
        "Escape",
        "Tab",
        "ArrowUp",
        "ArrowDown",
      ]);

      // Skip if modifiers that ActionT doesn't handle for these keys
      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "Enter" && modPressed) return false; // Mod+Enter is toggle todo
      if (
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        (e.altKey || modPressed)
      ) {
        return false; // Alt/Cmd+Arrow is move/collapse
      }

      if (!actionTHandledKeys.has(e.key)) return false;

      // Normalize "Mod" key: Accept both metaKey and ctrlKey as "Mod"
      const modKeyPressed = e.metaKey || e.ctrlKey;

      const action: AppAction = {
        _tag: "KeyDown",
        key: e.key,
        modifiers: {
          meta: modKeyPressed, // Normalized: true when "Mod" key is pressed
          ctrl: e.ctrlKey,
          alt: e.altKey,
          shift: e.shiftKey,
        },
        source: {
          type: "document",
          bufferId,
        },
      };

      const result = runtime.runSync(
        Effect.gen(function* () {
          const Action = yield* ActionT;
          return yield* Action.handle(action);
        }),
      );

      if (result.handled) {
        e.preventDefault();
        executeDOMIntent(result.intent);
        return true;
      }

      return false;
    };

    // Handle keyboard events in block selection mode
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if event came from inside CodeMirror, EXCEPT for Mod+Up
      // (Mod+Up needs to work in both text editing and block selection modes)
      const target = e.target;
      const isModUp =
        e.key === "ArrowUp" &&
        !e.altKey &&
        !e.shiftKey &&
        (isMac ? e.metaKey : e.ctrlKey);
      if (
        target instanceof HTMLElement &&
        target.closest(".cm-editor") &&
        !isModUp
      ) {
        return;
      }

      // Route all document-level keydown through ActionT
      tryActionTDocumentKeyDown(e);
    };

    document.addEventListener("keydown", handleKeyDown);

    // Subscribe to global picker state for this buffer
    const pickerFiber = runtime.runFork(
      Effect.gen(function* () {
        const Picker = yield* PickerT;
        const stream = yield* Picker.subscribe();
        yield* Stream.runForEach(stream, (state) =>
          Effect.sync(() => {
            setPickerState(state);
          }),
        );
      }),
    );

    onCleanup(() => {
      dispose();
      runtime.runFork(Fiber.interrupt(activeElementFiber));
      runtime.runFork(Fiber.interrupt(pickerFiber));
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
            targetBlockId = Id.makeBufferBlockId(bufferId, lastChildId);
          } else {
            targetNodeId = yield* Node.insertNode({
              parentId: nodeId,
              insert: "after",
            });
            targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);
          }
        } else {
          targetNodeId = yield* Node.insertNode({
            parentId: nodeId,
            insert: "after",
          });
          targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);
        }

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { elementId: targetBlockId },
            anchorOffset: 0,
            focus: { elementId: targetBlockId },
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
    <PickerStateContext.Provider value={pickerState}>
      <ActiveElementContext.Provider value={activeElement}>
        <div data-testid="editor-buffer" class="h-full flex flex-col">
          <Show when={store.nodeId} keyed>
            {(nodeId) => (
              <>
                <header class="mx-auto max-w-[var(--max-line-width)] w-full border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
                  <Title bufferId={bufferId} nodeId={nodeId} />
                  <TypeList nodeId={nodeId} />
                </header>
                <ViewTabs
                  bufferId={bufferId}
                  nodeId={nodeId}
                  activeViewId={store.activeViewId}
                />
                <PropertyList pageId={nodeId} bufferId={bufferId} />
                <Show
                  when={store.activeViewId}
                  fallback={
                    <div
                      data-testid="editor-body"
                      class="flex-1 flex flex-col pt-4"
                    >
                      <div class="mx-auto flex flex-col gap-1.5 max-w-[var(--max-line-width)] w-full">
                        <For each={store.childBlockIds}>
                          {(childId) => <Block blockId={childId} />}
                        </For>
                      </div>
                      <div
                        data-testid="editor-click-zone"
                        class="flex-1 min-h-[25vh] cursor-text"
                        onClick={(e) => handleClickZone(e, nodeId)}
                      />
                    </div>
                  }
                >
                  <div
                    data-testid="editor-body"
                    class="flex-1 flex flex-col pt-4"
                  >
                    <TableView
                      bufferId={bufferId}
                      nodeId={nodeId}
                      childNodeIds={getChildNodeIds()}
                    />
                  </div>
                </Show>
              </>
            )}
          </Show>
          <Show when={getPickerForBuffer()}>
            {(picker) => (
              <TypePicker
                position={picker().state.position}
                query={picker().state.query}
                nodeId={picker().nodeId}
                onSelect={handleTypePickerSelect}
                onCreate={handleTypePickerCreate}
                onClose={handleTypePickerClose}
              />
            )}
          </Show>
        </div>
      </ActiveElementContext.Provider>
    </PickerStateContext.Provider>
  );
}
