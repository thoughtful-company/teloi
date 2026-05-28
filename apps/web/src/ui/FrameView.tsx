import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, Model } from "@/schema";
import {
  KhoraT,
  resolveEffectiveActiveViewId,
  type ViewInfo,
  type ViewType,
} from "@/services/ui/Khora";
import { FrameT } from "@/services/ui/Frame";
import { PropertyT, type PropertyInfo } from "@/services/ui/Property";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { Effect, Fiber, Stream } from "effect";
import {
  createEffect,
  createMemo,
  createSignal,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import PropertySection from "./PropertySection";
import Title from "./Title";
import TypeList from "./TypeList";
import { BlockTypePicker } from "./TypePicker";
import ViewRenderer from "./ViewRenderer";
import ViewTabs from "./ViewTabs";

/** Helper component to render properties for the active view of a page. */
function PropertyList(props: {
  pageId: Id.Node;
  frameId: Id.Frame;
  activeViewId: Id.Node | null;
}) {
  const runtime = useBrowserRuntime();
  const [properties, setProperties] = createSignal<PropertyInfo[]>([]);

  let fiber: Fiber.RuntimeFiber<void, unknown> | null = null;

  createEffect(() => {
    const activeViewId = props.activeViewId;

    if (fiber) {
      runtime.runFork(Fiber.interrupt(fiber));
      fiber = null;
    }

    if (!activeViewId) {
      setProperties([]);
      return;
    }

    fiber = runtime.runFork(
      Effect.gen(function* () {
        const Property = yield* PropertyT;
        const propertiesStream = yield* Property.subscribePropertiesForView(
          activeViewId,
        );

        yield* Stream.runForEach(propertiesStream, (props_) =>
          Effect.sync(() => setProperties([...props_])),
        );
      }),
    );
  });

  onCleanup(() => {
    if (fiber) {
      runtime.runFork(Fiber.interrupt(fiber));
    }
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

type FrameShellState = {
  nodeId: Id.Node | null;
  isKhoraSelectionMode: boolean;
  popup: Model.FramePopup | null;
};

type RootKhoraViewState = {
  nodeId: Id.Node | null;
  activeViewId: Id.Node | null;
  activeViewType: ViewType;
  availableViews: readonly ViewInfo[];
};

const INITIAL_FRAME_SHELL_STATE: FrameShellState = {
  nodeId: null,
  isKhoraSelectionMode: false,
  popup: null,
};

const INITIAL_ROOT_KHORA_VIEW_STATE: RootKhoraViewState = {
  nodeId: null,
  activeViewId: null,
  activeViewType: "page",
  availableViews: [],
};

/**
 * Render the editor UI for a single frame.
 *
 * Subscribes to the frame shell for node/focus state and to the root khora for
 * view state, then renders the frame header and active view when a root node is
 * present.
 */
export default function FrameView({ frameId }: FrameViewProps) {
  const runtime = useBrowserRuntime();

  const frameStream = Stream.unwrap(
    Effect.gen(function* () {
      const Frame = yield* FrameT;
      return yield* Frame.subscribe(frameId);
    }),
  );

  const rootKhoraViewStream = Stream.unwrap(
    Effect.gen(function* () {
      const Khora = yield* KhoraT;

      return Stream.flatMap(
        frameStream.pipe(
          Stream.map((frame) => Id.Node.make(frame.nodeData.id)),
          Stream.changesWith((a, b) => a === b),
        ),
        (nodeId) => {
          // Emit an inert snapshot immediately so the frame shell can render
          // before the khora subscription produces its first value.
          return Stream.concat(
            Stream.make({ ...INITIAL_ROOT_KHORA_VIEW_STATE, nodeId }),
            Stream.unwrap(
              Khora.subscribe(Id.makeFrameKhoraId(frameId, nodeId)).pipe(
                Effect.map((stream) =>
                  stream.pipe(
                    Stream.map((view) => ({
                      nodeId,
                      activeViewId: view.activeViewId,
                      activeViewType: view.activeViewType,
                      availableViews: view.availableViews,
                    })),
                  ),
                ),
              ),
            ),
          );
        },
        { switch: true },
      );
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: frameStream,
    project: (v): FrameShellState => ({
      nodeId: Id.Node.make(v.nodeData.id),
      isKhoraSelectionMode: v.isKhoraSelectionMode,
      popup: v.popup,
    }),
    initial: INITIAL_FRAME_SHELL_STATE,
  });

  const { store: rootKhoraStore, start: startRootKhora } = bindStreamToStore({
    stream: rootKhoraViewStream,
    project: (v): RootKhoraViewState => ({
      nodeId: v.nodeId,
      activeViewId: v.activeViewId,
      activeViewType: v.activeViewType,
      availableViews: v.availableViews,
    }),
    initial: INITIAL_ROOT_KHORA_VIEW_STATE,
  });

  const effectiveActiveViewId = createMemo(() =>
    resolveEffectiveActiveViewId(
      rootKhoraStore.activeViewId,
      rootKhoraStore.availableViews,
    ),
  );

  const typePickerPopup = createMemo(() => {
    const popup = store.popup;
    return popup?.type === "typePicker" ? popup : null;
  });

  let containerRef!: HTMLDivElement;

  onMount(() => {
    const disposeFrame = start(runtime);
    const disposeRootKhora = startRootKhora(runtime);

    onCleanup(() => {
      disposeFrame();
      disposeRootKhora();
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
      <Show when={typePickerPopup()} keyed>
        {(popup) => <BlockTypePicker frameId={frameId} popup={popup} />}
      </Show>
      <Show when={store.nodeId} keyed>
        {(nodeId) => (
          <>
            <header class="mx-auto max-w-[var(--max-line-width)] w-full border-b-[1.5px] border-rule-subtle pb-3 pt-7">
              <Title frameId={frameId} nodeId={nodeId} />
              <TypeList nodeId={nodeId} />
            </header>
            <ViewTabs
              availableViews={rootKhoraStore.availableViews}
              activeViewId={effectiveActiveViewId()}
              onTabClick={(viewId) => {
                runtime.runPromise(
                  Effect.gen(function* () {
                    const Khora = yield* KhoraT;
                    yield* Khora.setActiveView(
                      Id.makeFrameKhoraId(frameId, nodeId),
                      viewId,
                    );
                  }),
                );
              }}
            />
            <PropertyList
              pageId={nodeId}
              frameId={frameId}
              activeViewId={effectiveActiveViewId()}
            />
            <div class="flex-1 flex flex-col pt-4">
              <ViewRenderer
                viewType={rootKhoraStore.activeViewType}
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
