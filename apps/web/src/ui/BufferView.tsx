import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Entity, Id, Model } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { PropertyT, type PropertyInfo } from "@/services/ui/Property";
import { ViewT, type ViewInfo } from "@/services/ui/View";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Option, Stream } from "effect";
import {
  createContext,
  createEffect,
  createSignal,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import PropertySection from "./PropertySection";
import Title from "./Title";
import { BlockTypePicker } from "./TypePicker";
import TypeList from "./TypeList";
import ViewRenderer from "./ViewRenderer";
import ViewTabs from "./ViewTabs";

/** Context to expose activeElement to child components for scroll-on-mount behavior */
export const ActiveElementContext = createContext<() => Entity.Element | null>(
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

interface BufferViewProps {
  bufferId: Id.Buffer;
}

/**
 * Render the editor UI for a single buffer.
 *
 * Subscribes to the buffer identified by `bufferId`, binds its updates to local state, and renders
 * the buffer header (Title) and the active view when a root node is present.
 */
export default function BufferView({ bufferId }: BufferViewProps) {
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
      nodeId: Id.Node.make(v.nodeData.id) as Id.Node | null,
      activeViewId: v.activeViewId,
      activeViewType: v.activeViewType,
      availableViews: v.availableViews as ViewInfo[],
      activeElement: Option.getOrNull(v.activeElement),
      popup: v.popup,
    }),
    initial: {
      nodeId: null as Id.Node | null,
      activeViewId: null as Id.Node | null,
      activeViewType: "page" as const,
      availableViews: [] as ViewInfo[],
      activeElement: null as Entity.Element | null,
      popup: null as Model.BufferPopup | null,
    },
  });

  const getActiveElement = () => store.activeElement;

  let containerRef!: HTMLDivElement;

  // Focus the buffer container when entering block-selection mode
  // or when popup closes (to restore keyboard event routing).
  createEffect(() => {
    if (store.activeElement?.type === "buffer" && !store.popup) {
      containerRef.focus();
    }
  });

  onMount(() => {
    const dispose = start(runtime);

    onCleanup(() => {
      dispose();
    });
  });

  return (
    <ActiveElementContext.Provider value={getActiveElement}>
      <div
        ref={containerRef}
        data-testid="buffer"
        data-buffer-id={bufferId}
        tabIndex={0}
        class="h-full flex flex-col outline-none"
      >
        <Show
          when={store.popup?.type === "typePicker" ? store.popup : null}
          keyed
        >
          {(popup) => (
            <BlockTypePicker
              bufferId={bufferId}
              popup={popup as Model.BufferPopup & { type: "typePicker" }}
            />
          )}
        </Show>
        <Show when={store.nodeId} keyed>
          {(nodeId) => (
            <>
              <header class="mx-auto max-w-[var(--max-line-width)] w-full border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
                <Title bufferId={bufferId} nodeId={nodeId} />
                <TypeList nodeId={nodeId} />
              </header>
              <ViewTabs
                availableViews={store.availableViews}
                activeViewId={store.activeViewId}
                onTabClick={(viewId) => {
                  runtime.runPromise(
                    Effect.gen(function* () {
                      const Buffer = yield* BufferT;
                      yield* Buffer.setActiveView(bufferId, viewId);
                    }),
                  );
                }}
              />
              <PropertyList pageId={nodeId} bufferId={bufferId} />
              <div class="flex-1 flex flex-col pt-4">
                <ViewRenderer
                  viewType={store.activeViewType}
                  bufferId={bufferId}
                  nodeId={nodeId}
                />
              </div>
            </>
          )}
        </Show>
      </div>
    </ActiveElementContext.Provider>
  );
}
