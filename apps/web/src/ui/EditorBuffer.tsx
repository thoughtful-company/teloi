import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import type { Entity } from "@/schema";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import type { PickerState } from "@/services/ui/Picker";
import { PropertyT, type PropertyInfo } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Stream } from "effect";
import {
  createContext,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import Block from "./Block";
import PropertySection from "./PropertySection";
import TableView from "./TableView";
import Title from "./Title";
import TypeList from "./TypeList";
import { TypePicker } from "./TypePicker";
import ViewTabs from "./ViewTabs";

/** Context to expose activeElement to child components for scroll-on-mount behavior */
export const ActiveElementContext = createContext<() => Entity.Element | null>(
  () => null,
);

/** Context to expose picker state to Block/Title for query updates */
export const PickerStateContext = createContext<() => PickerState | null>(
  () => null,
);

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

  // TODO: These should be populated by ViewModel subscriptions passed as props
  const [activeElement] = createSignal<Entity.Element | null>(null);
  const [pickerState] = createSignal<PickerState | null>(null);

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

  onMount(() => {
    const dispose = start(runtime);

    onCleanup(() => {
      dispose();
    });
  });

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
