import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { Effect, Fiber, Option, Stream } from "effect";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import Icon from "./Icon";

interface TopBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  panes: readonly Id.Pane[];
  framesByPane: ReadonlyMap<Id.Pane, readonly Id.Frame[]>;
}

interface TabPaneIdentity {
  paneId: Id.Pane;
  frameId: Id.Frame;
  nodeId: Id.Node | null;
}

const resolveFrameNodeId = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
      Effect.orDie,
    );
    return Option.match(frameDoc, {
      onNone: () => null,
      onSome: (doc) => (doc.assignedKhoraId as Id.Node | null) ?? null,
    });
  });

function TabTitle(props: { nodeId: Id.Node | null }) {
  const runtime = useBrowserRuntime();
  const [title, setTitle] = createSignal("Untitled");

  createEffect(() => {
    const nodeId = props.nodeId;
    if (!nodeId) {
      setTitle("Untitled");
      return;
    }

    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const Automerge = yield* AutomergeT;
        const stream = yield* Automerge.subscribeText(nodeId);
        yield* Stream.runForEach(stream, ({ content }) =>
          Effect.sync(() => setTitle(content.trim() || "Untitled")),
        );
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber));
    });
  });

  return <span class="truncate">{title()}</span>;
}

function PanePip(props: { identity: TabPaneIdentity; index: number }) {
  return (
    <button
      class="group/pip relative flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary active:bg-surface-active"
      title={`Pane ${props.index + 1}`}
      aria-label={`Attached pane ${props.index + 1}`}
    >
      <span class="absolute inset-0 flex items-center justify-center opacity-100 transition-opacity group-hover:opacity-0 group-hover/pip:opacity-0">
        <Show
          when={props.identity.nodeId}
          fallback={<Icon name="node" class="size-[15px]" />}
        >
          {(nodeId) => <TabInitial nodeId={nodeId()} fallback={props.index + 1} />}
        </Show>
      </span>
      <span class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
        <Icon name="x" class="size-3" />
      </span>
    </button>
  );
}

function TabInitial(props: { nodeId: Id.Node; fallback: number }) {
  const runtime = useBrowserRuntime();
  const [initial, setInitial] = createSignal(String(props.fallback));

  createEffect(() => {
    const nodeId = props.nodeId;
    const fallback = props.fallback;

    const fiber = runtime.runFork(
      Effect.gen(function* () {
        const Automerge = yield* AutomergeT;
        const stream = yield* Automerge.subscribeText(nodeId);
        yield* Stream.runForEach(stream, ({ content }) =>
          Effect.sync(() =>
            setInitial(
              content.trim().charAt(0).toUpperCase() || String(fallback),
            ),
          ),
        );
      }),
    );

    onCleanup(() => {
      runtime.runFork(Fiber.interrupt(fiber));
    });
  });

  return <span class="text-[11px] font-medium leading-none">{initial()}</span>;
}

const topbarIconButton =
  "flex h-[30px] w-[30px] items-center justify-center rounded-[var(--radius-control)] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary active:bg-surface-active active:text-text-primary";

export default function TopBar(props: TopBarProps) {
  const runtime = useBrowserRuntime();

  const tabPaneIdentities = createMemo(() =>
    props.panes.flatMap((paneId) => {
      const frameId = props.framesByPane.get(paneId)?.[0];
      if (!frameId) return [];

      const nodeId = runtime.runSync(resolveFrameNodeId(frameId));
      return [{ paneId, frameId, nodeId } satisfies TabPaneIdentity];
    }),
  );

  const mainIdentity = createMemo(() => tabPaneIdentities()[0] ?? null);
  const attachedIdentities = createMemo(() => tabPaneIdentities().slice(1));

  return (
    <header class="relative z-10 flex h-[34px] shrink-0 items-center gap-1 bg-transparent pr-2 text-text-primary">
      <div class="flex h-full items-center gap-0.5 pb-1 pl-1">
        <button
          type="button"
          onClick={props.onToggleSidebar}
          class={topbarIconButton}
          aria-label={props.sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <Icon name="sidebar-simple" class="size-5" />
        </button>
        <button
          type="button"
          class={topbarIconButton}
          aria-label="Back"
          aria-disabled="true"
        >
          <Icon name="caret-left" class="size-5" />
        </button>
        <button
          type="button"
          class={topbarIconButton}
          aria-label="Forward"
          aria-disabled="true"
        >
          <Icon name="caret-right" class="size-5" />
        </button>
      </div>

      <div class="flex h-full min-w-0 flex-1 items-center overflow-x-clip">
        <Show
          when={mainIdentity()}
          fallback={
            <div class="app-top-tab is-active group self-end">
              <span class="app-top-tab-inner">
                <Icon name="node" class="size-[15px]" />
                <span class="app-top-tab-title">{System.WORKSPACE}</span>
              </span>
              <span
                class="app-top-tab-foot app-top-tab-foot-l"
                aria-hidden="true"
              >
                <span class="app-top-tab-foot-arc" />
              </span>
              <span
                class="app-top-tab-foot app-top-tab-foot-r"
                aria-hidden="true"
              >
                <span class="app-top-tab-foot-arc" />
              </span>
              <span
                class="pointer-events-none absolute -left-[10px] -right-[10px] -bottom-[1px] z-10 h-px bg-surface-pane"
                aria-hidden="true"
              />
            </div>
          }
        >
          {(identity) => (
            <div class="app-top-tab is-active group self-end">
              <span class="app-top-tab-inner">
                <Icon name="node" class="size-[15px]" />
                <span class="app-top-tab-title">
                  <TabTitle nodeId={identity().nodeId} />
                </span>
                <button class="app-top-tab-close" aria-label="Close tab">
                  <Icon name="x" class="size-3" />
                </button>
                <Show when={attachedIdentities().length > 0}>
                  <span class="ml-1.5 flex shrink-0 items-center gap-0.5 border-l border-border-subtle pl-1.5">
                    <For each={attachedIdentities()}>
                      {(attached, index) => (
                        <PanePip identity={attached} index={index() + 1} />
                      )}
                    </For>
                  </span>
                </Show>
              </span>
              <span
                class="app-top-tab-foot app-top-tab-foot-l"
                aria-hidden="true"
              >
                <span class="app-top-tab-foot-arc" />
              </span>
              <span
                class="app-top-tab-foot app-top-tab-foot-r"
                aria-hidden="true"
              >
                <span class="app-top-tab-foot-arc" />
              </span>
              {/*
                Seam cover: a 1px-tall band at the tab+feet bottom that sits
                on top of the pane's top border within the tab+feet horizontal
                footprint. Pane has border-[0.5px] all around; this guarantees
                the pane's top border is fully masked under the tab+feet
                regardless of sub-pixel rounding from the margin-bottom overlap.
              */}
              <span
                class="pointer-events-none absolute -left-[10px] -right-[10px] -bottom-[1px] z-10 h-px bg-surface-pane"
                aria-hidden="true"
              />
            </div>
          )}
        </Show>
        <div class="flex h-full items-center pb-1">
          <button
            type="button"
            class={`${topbarIconButton} ml-1`}
            aria-label="New tab"
          >
            <Icon name="plus" class="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
