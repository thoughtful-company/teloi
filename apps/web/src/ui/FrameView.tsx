import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, Model } from "@/schema";
import { BlockT, type ViewInfo } from "@/services/ui/Block";
import { FrameT } from "@/services/ui/Frame";
import { PropertyT, type PropertyInfo } from "@/services/ui/Property";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Stream } from "effect";
import { createSignal, Index, onCleanup, onMount, Show } from "solid-js";
import PropertySection from "./PropertySection";
import Title from "./Title";
import TypeList from "./TypeList";
import { BlockTypePicker } from "./TypePicker";
import ViewRenderer from "./ViewRenderer";
import ViewTabs from "./ViewTabs";

/** Helper component to render properties for a page's view */
function PropertyList(props: { pageId: Id.Node; frameId: Id.Frame }) {
  const runtime = useBrowserRuntime();
  const [properties, setProperties] = createSignal<PropertyInfo[]>([]);

  onMount(() => {
    // Subscribe to views for the page, then subscribe to properties when a view exists
    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        const Property = yield* PropertyT;

        // Subscribe to views for the node
        const viewsStream = yield* Block.subscribeViewsForNode(props.pageId);

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
              frameId={props.frameId}
            />
          )}
        </Index>
      </div>
    </Show>
  );
}

interface FrameViewProps {
  frameId: Id.Frame;
}

/**
 * Render the editor UI for a single frame.
 *
 * Subscribes to the frame identified by `frameId`, binds its updates to local state, and renders
 * the frame header (Title) and the active view when a root node is present.
 */
export default function FrameView({ frameId }: FrameViewProps) {
  const runtime = useBrowserRuntime();

  const frameStream = Stream.unwrap(
    Effect.gen(function* () {
      const Frame = yield* FrameT;
      return yield* Frame.subscribe(frameId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: frameStream,
    project: (v) => ({
      nodeId: Id.Node.make(v.nodeData.id) as Id.Node | null,
      activeViewId: v.activeViewId,
      activeViewType: v.activeViewType,
      availableViews: v.availableViews as ViewInfo[],
      isBlockSelectionMode: v.isBlockSelectionMode,
      popup: v.popup,
    }),
    initial: {
      nodeId: null as Id.Node | null,
      activeViewId: null as Id.Node | null,
      activeViewType: "page" as const,
      availableViews: [] as ViewInfo[],
      isBlockSelectionMode: false,
      popup: null as Model.FramePopup | null,
    },
  });

  let containerRef!: HTMLDivElement;

  onMount(() => {
    const dispose = start(runtime);

    onCleanup(() => {
      dispose();
    });
  });

  return (
    <div
      ref={containerRef}
      data-testid="frame"
      data-frame-id={frameId}
      tabIndex={0}
      class="h-full flex flex-col outline-none"
    >
      <Show
        when={store.popup?.type === "typePicker" ? store.popup : null}
        keyed
      >
        {(popup) => (
          <BlockTypePicker
            frameId={frameId}
            popup={popup as Model.FramePopup & { type: "typePicker" }}
          />
        )}
      </Show>
      <Show when={store.nodeId} keyed>
        {(nodeId) => (
          <>
            <header class="mx-auto max-w-[var(--max-line-width)] w-full border-b-[1.5px] border-foreground-lighter pb-3 pt-7">
              <Title frameId={frameId} nodeId={nodeId} />
              <TypeList nodeId={nodeId} />
            </header>
            <ViewTabs
              availableViews={store.availableViews}
              activeViewId={store.activeViewId}
              onTabClick={(viewId) => {
                runtime.runPromise(
                  Effect.gen(function* () {
                    const Frame = yield* FrameT;
                    yield* Frame.setActiveView(frameId, viewId);
                  }),
                );
              }}
            />
            <PropertyList pageId={nodeId} frameId={frameId} />
            <div class="flex-1 flex flex-col pt-4">
              <ViewRenderer
                viewType={store.activeViewType}
                frameId={frameId}
                nodeId={nodeId}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
