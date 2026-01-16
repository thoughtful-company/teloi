import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TitleLinkT, type TitleLink } from "@/services/domain/TitleLink";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { TitleT, type TitleSelection } from "@/services/ui/Title";
import { TypePickerT } from "@/services/ui/TypePicker";
import { NavigationT } from "@/services/ui/Navigation";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import {
  resolveSelectionStrategy,
  updateEditorSelection,
} from "@/utils/selectionStrategy";
import { Effect, Match, Option, Stream } from "effect";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import TextEditor, {
  type EditorAction,
  type SelectionInfo,
} from "./TextEditor";
import { TypePicker } from "./TypePicker";

interface TitleProps {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
}

/**
 * Render and manage an editable title for a buffer node.
 *
 * Synchronizes the displayed text with a Yjs text object, switches between a read-only heading
 * and an interactive TextEditor when the title becomes active, and handles focus and keyboard
 * navigation (ArrowRight at end, ArrowDown on last line, Enter to split/create a child node).
 */
export default function Title({ bufferId, nodeId }: TitleProps) {
  const runtime = useBrowserRuntime();

  // Get Yjs service for text access
  const Yjs = runtime.runSync(YjsT);

  // Title link state: which node's text to display and how
  const [titleLink, setTitleLink] = createSignal<TitleLink | null>(null);

  // Compute display node: use source if linked, otherwise self
  const displayNodeId = () => titleLink()?.sourceId ?? nodeId;
  // titleMode() can be used for readonly/detach handling: titleLink()?.mode ?? "synced"

  // Get Y.Text for the display node (reactive based on title link)
  const getYtext = () => Yjs.getText(displayNodeId());
  const getUndoManager = () => Yjs.getUndoManager(displayNodeId());

  // Reactive text content signal for unfocused view
  const [textContent, setTextContent] = createSignal(getYtext().toString());

  // Combined stream for title state and title link
  const titleStream = Stream.unwrap(
    Effect.gen(function* () {
      const Title = yield* TitleT;
      return yield* Title.subscribe(bufferId, nodeId);
    }),
  );

  const titleLinkStream = Stream.unwrap(
    Effect.gen(function* () {
      const TitleLink = yield* TitleLinkT;
      return yield* TitleLink.subscribe(nodeId);
    }),
  );

  const { store, start } = bindStreamToStore({
    stream: titleStream,
    project: (v) => v,
    initial: {
      isActive: false,
      selection: null as TitleSelection | null,
    },
  });

  const { start: startTitleLink } = bindStreamToStore({
    stream: titleLinkStream,
    project: (link) => {
      setTitleLink(link);
      // Update text content when display node changes
      setTextContent(Yjs.getText(link?.sourceId ?? nodeId).toString());
      return { link };
    },
    initial: { link: null as TitleLink | null },
  });

  // Type picker state
  const [pickerState, setPickerState] = createSignal<{
    visible: boolean;
    position: { x: number; y: number };
    from: number;
  } | null>(null);

  const getPickerQuery = () => {
    const state = pickerState();
    if (!state) return "";
    const text = textContent();
    const cursorPos = store.selection?.head ?? text.length;
    return text.slice(state.from + 1, cursorPos);
  };

  onMount(() => {
    const dispose = start(runtime);
    const disposeTitleLink = startTitleLink(runtime);

    // Track current ytext observer for cleanup when display node changes
    const currentYtext = getYtext();
    const observer = () => setTextContent(getYtext().toString());
    currentYtext.observe(observer);

    // Note: The title link subscription's project function handles text content updates
    // when the display node changes

    onCleanup(() => {
      dispose();
      disposeTitleLink();
      currentYtext.unobserve(observer);
    });
  });

  let clickCoords: { x: number; y: number } | null = null;

  const handleFocus = (e: MouseEvent) => {
    clickCoords = { x: e.clientX, y: e.clientY };
    runtime.runPromise(
      Effect.gen(function* () {
        const Window = yield* WindowT;
        yield* Window.setActiveElement(
          Option.some({ type: "title" as const, bufferId }),
        );
      }),
    );
  };

  const handleBlur = () => {
    // Don't clear activeElement when window loses focus (alt-tab, tab switch).
    // Only clear when user clicks elsewhere within the document.
    if (!document.hasFocus()) {
      return;
    }

    runtime.runPromise(
      Effect.gen(function* () {
        const Title = yield* TitleT;
        yield* Title.blur(bufferId);
      }),
    );
  };

  const handleSelectionChange = (selection: SelectionInfo) => {
    runtime.runPromise(updateEditorSelection(bufferId, nodeId, selection));
  };

  const handleTypePickerOpen = (
    position: { x: number; y: number },
    from: number,
  ) => {
    setPickerState({ visible: true, position, from });
  };

  const handleTypePickerClose = () => {
    setPickerState(null);
  };

  const handleTypePickerSelect = (typeId: Id.Node) => {
    const state = pickerState();
    if (!state) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const Buffer = yield* BufferT;

        yield* TypePicker.applyType(nodeId, typeId);

        const cursorPos = store.selection?.head ?? getYtext().length;
        const deleteLength = cursorPos - state.from;
        if (deleteLength > 0) {
          getYtext().delete(state.from, deleteLength);
        }

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: state.from,
            focus: { nodeId },
            focusOffset: state.from,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        yield* Effect.logDebug("[Title] Type selected via picker").pipe(
          Effect.annotateLogs({ bufferId, nodeId, typeId }),
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError("[Title] Type picker select failed").pipe(
            Effect.annotateLogs({
              bufferId,
              nodeId,
              typeId,
              error: String(err),
            }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    setPickerState(null);
  };

  const handleTypePickerCreate = (name: string) => {
    const state = pickerState();
    if (!state) return;

    runtime.runFork(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const Buffer = yield* BufferT;

        const typeId = yield* TypePicker.createType(name);
        yield* TypePicker.applyType(nodeId, typeId);

        const cursorPos = store.selection?.head ?? getYtext().length;
        const deleteLength = cursorPos - state.from;
        if (deleteLength > 0) {
          getYtext().delete(state.from, deleteLength);
        }

        yield* Buffer.setSelection(
          bufferId,
          Option.some({
            anchor: { nodeId },
            anchorOffset: state.from,
            focus: { nodeId },
            focusOffset: state.from,
            goalX: null,
            goalLine: null,
            assoc: 0,
          }),
        );

        yield* Effect.logDebug("[Title] Type created via picker").pipe(
          Effect.annotateLogs({ bufferId, nodeId, typeId, name }),
        );
      }).pipe(
        Effect.tapError((err) =>
          Effect.logError("[Title] Type picker create failed").pipe(
            Effect.annotateLogs({ bufferId, nodeId, name, error: String(err) }),
          ),
        ),
        Effect.catchAll(() => Effect.void),
      ),
    );

    setPickerState(null);
  };

  const handleZoomOut = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;
        const Navigation = yield* NavigationT;
        const Window = yield* WindowT;

        const parentId = yield* Node.getParent(nodeId).pipe(
          Effect.catchTag("NodeHasNoParentError", () =>
            Effect.succeed<Id.Node | null>(null),
          ),
        );

        if (!parentId) return;

        yield* Navigation.navigateTo(parentId);

        // Preserve selection: title's nodeId becomes a block in the parent view
        const newBlockId = Id.makeBlockId(bufferId, nodeId);
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: newBlockId }),
        );
        // Block scrolls itself on mount via ActiveElementContext
      }),
    );
  };

  const handleAction = (action: EditorAction): void => {
    Match.value(action).pipe(
      Match.tag("Enter", ({ info }) => {
        if (pickerState()) {
          const query = getPickerQuery();
          runtime.runPromise(
            Effect.gen(function* () {
              const TypePicker = yield* TypePickerT;
              const types = yield* TypePicker.getAvailableTypes();
              const filtered = TypePicker.filterTypes(types, query);
              if (filtered.length > 0) {
                handleTypePickerSelect(filtered[0]!.id);
              } else if (query) {
                handleTypePickerCreate(query);
              }
            }),
          );
          return;
        }
        runtime.runPromise(
          Effect.gen(function* () {
            const Title = yield* TitleT;
            yield* Title.enter(bufferId, nodeId, {
              cursorPos: info.cursorPos,
              textAfter: info.textAfter,
            });
          }),
        );
      }),
      Match.tag("Blur", () => handleBlur()),
      Match.tag("SelectionChange", ({ selection }) =>
        handleSelectionChange(selection),
      ),
      Match.tag("Navigate", ({ direction, goalX }) => {
        Match.value(direction).pipe(
          Match.when("right", () => {
            runtime.runPromise(
              Effect.gen(function* () {
                const Title = yield* TitleT;
                yield* Title.navigateToFirstChild(bufferId, nodeId);
              }),
            );
          }),
          Match.when("down", () => {
            runtime.runPromise(
              Effect.gen(function* () {
                const Title = yield* TitleT;
                yield* Title.navigateToFirstChild(bufferId, nodeId, goalX ?? 0);
              }),
            );
          }),
          Match.orElse(() => {}),
        );
      }),
      Match.tag("Escape", () => handleTypePickerClose()),
      Match.tag("TypePickerOpen", ({ position, from }) =>
        handleTypePickerOpen(position, from),
      ),
      Match.tag("TypePickerUpdate", () => {
        // Query is computed reactively from textContent and selection
      }),
      Match.tag("TypePickerClose", () => handleTypePickerClose()),
      Match.tag("Expand", () => {
        // Drill down level by level, expanding all collapsed nodes at each level
        runtime.runPromise(
          Effect.gen(function* () {
            const Node = yield* NodeT;
            const Block = yield* BlockT;

            let currentLevel = yield* Node.getNodeChildren(nodeId);

            while (currentLevel.length > 0) {
              const collapsedExpandable: Id.Node[] = [];

              for (const childId of currentLevel) {
                const grandchildren = yield* Node.getNodeChildren(childId);
                if (grandchildren.length === 0) continue;

                const childBlockId = Id.makeBlockId(bufferId, childId);
                const isExpanded = yield* Block.isExpanded(childBlockId);
                if (!isExpanded) {
                  collapsedExpandable.push(childId);
                }
              }

              if (collapsedExpandable.length > 0) {
                for (const childId of collapsedExpandable) {
                  const childBlockId = Id.makeBlockId(bufferId, childId);
                  yield* Block.setExpanded(childBlockId, true);
                }
                return;
              }

              // Go deeper - collect all children
              const nextLevel: Id.Node[] = [];
              for (const childId of currentLevel) {
                const grandchildren = yield* Node.getNodeChildren(childId);
                nextLevel.push(...grandchildren);
              }
              currentLevel = nextLevel;
            }
          }),
        );
      }),
      Match.tag("ZoomOut", () => handleZoomOut()),
      Match.orElse(() => {}),
    );
  };

  return (
    <div
      data-element-id={bufferId}
      data-element-type="title"
      onClick={handleFocus}
      class="min-h-[var(--text-title--line-height)]"
    >
      <Show
        when={store.isActive}
        fallback={
          <h1 class="text-title leading-[var(--text-title--line-height)] font-semibold whitespace-break-spaces">
            {textContent()}
          </h1>
        }
      >
        <TextEditor
          ytext={getYtext()}
          undoManager={getUndoManager()}
          onAction={handleAction}
          initialStrategy={resolveSelectionStrategy({
            clickCoords,
            domSelection: null,
            modelSelection: store.selection,
          })}
          selection={store.selection}
          variant="title"
        />
      </Show>
      <Show when={pickerState()}>
        {(state) => (
          <TypePicker
            position={state().position}
            query={getPickerQuery()}
            nodeId={nodeId}
            onSelect={handleTypePickerSelect}
            onCreate={handleTypePickerCreate}
            onClose={handleTypePickerClose}
          />
        )}
      </Show>
    </div>
  );
}
