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

function DocumentIcon() {
  // Custom glyph from the redesign prototype: a central node wired out to four
  // small endpoint nodes. Matches `I.doc` in teloi-handoff/project/icons.jsx.
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="2.2" cy="2.2" r="1" />
      <circle cx="11.8" cy="2.2" r="1" />
      <circle cx="2.2" cy="11.8" r="1" />
      <circle cx="11.8" cy="11.8" r="1" />
      <line x1="3" y1="3" x2="5.7" y2="5.7" />
      <line x1="11" y1="3" x2="8.3" y2="5.7" />
      <line x1="3" y1="11" x2="5.7" y2="8.3" />
      <line x1="11" y1="11" x2="8.3" y2="8.3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
    </svg>
  );
}

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
        <Show when={props.identity.nodeId} fallback={<DocumentIcon />}>
          {(nodeId) => <TabInitial nodeId={nodeId()} fallback={props.index + 1} />}
        </Show>
      </span>
      <span class="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
        <CloseIcon />
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

function SidebarPanelIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      stroke-width="16"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="40" y="48" width="176" height="160" rx="12" />
      <line x1="96" y1="48" x2="96" y2="208" />
    </svg>
  );
}

function NavIcon(props: { direction: "back" | "forward" }) {
  const path = props.direction === "back" ? "M11 4l-4 4 4 4" : "M7 4l4 4-4 4";

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M7 3v8M3 7h8" />
    </svg>
  );
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
          <SidebarPanelIcon />
        </button>
        <button
          type="button"
          class={topbarIconButton}
          aria-label="Back"
          aria-disabled="true"
        >
          <NavIcon direction="back" />
        </button>
        <button
          type="button"
          class={topbarIconButton}
          aria-label="Forward"
          aria-disabled="true"
        >
          <NavIcon direction="forward" />
        </button>
      </div>

      <div class="flex h-full min-w-0 flex-1 items-center overflow-x-clip">
        <Show
          when={mainIdentity()}
          fallback={
            <div class="app-top-tab is-active group self-end">
              <span class="app-top-tab-inner">
                <DocumentIcon />
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
                <DocumentIcon />
                <span class="app-top-tab-title">
                  <TabTitle nodeId={identity().nodeId} />
                </span>
                <button class="app-top-tab-close" aria-label="Close tab">
                  <CloseIcon />
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
            <PlusIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
