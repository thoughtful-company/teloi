import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { useClickCapture } from "./hooks/useClickCapture";
import { useFocusBlur } from "./hooks/useFocusBlur";
import { useTitleLink } from "./hooks/useTitleLink";
import { NodeT } from "@/services/domain/Node";
import { TypeT } from "@/services/domain/Type";
import { PickerT } from "@/services/ui/Picker";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT } from "@/services/ui/Buffer";
import { PropertyT } from "@/services/ui/Property";
import { isSystemType } from "@/services/ui/TypePicker";
import { ViewT } from "@/services/ui/View";
import { WindowT } from "@/services/ui/Window";
import { ActionT, type AppAction, type DOMIntent } from "@/services/ui/Action";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { getCursorContext } from "@/utils/cursorContext";
import { resolveSelectionStrategy } from "@/utils/selectionStrategy";
import { Effect, Fiber, Option, Stream } from "effect";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  useContext,
} from "solid-js";
import { Transition } from "solid-transition-group";
import { ActiveElementContext, PickerStateContext } from "./EditorBuffer";
import { FormattedText } from "./FormattedText";
import TextEditor, { type SelectionInfo } from "./TextEditor";
import TypeBadge from "./TypeBadge";
import type { EditorView } from "@codemirror/view";

interface BlockProps {
  blockId: Id.Block;
}

/**
 * Renders an editable hierarchical block and keeps it synchronized with the application runtime and Yjs document state.
 *
 * The component displays read-only text when inactive and a rich text editor when active; it manages focus, selection, document stream subscription, Y.Text observation, and user editing/navigation behaviors (split/merge, indent/outdent, arrow navigation, zoom) for the given block.
 *
 * @param blockId - The block identifier to render and synchronize (Id.Block)
 * @returns The block's rendered TSX element containing the editor or read-only view and its child blocks
 */
export default function Block({ blockId }: BlockProps) {
  const runtime = useBrowserRuntime();

  // Lazy block creation: if block doesn't exist, create it then subscribe
  const blockStreamEffect = Effect.gen(function* () {
    const Block = yield* BlockT;
    const Store = yield* StoreT;

    return yield* Block.subscribe(blockId).pipe(
      Effect.catchTag("BlockNotFoundError", () =>
        Effect.gen(function* () {
          yield* Store.setDocument(
            "block",
            {
              isExpanded: true,
            },
            blockId,
          );

          return yield* Block.subscribe(blockId);
        }),
      ),
      Effect.catchTag("NodeNotFoundError", (err) =>
        Effect.dieMessage(err.toString()),
      ),
    );
  });

  const { store, start } = bindStreamToStore({
    stream: Stream.unwrap(blockStreamEffect),
    project: (view) => ({
      isActive: view.isActive,
      isSelected: view.isSelected,
      isExpanded: view.isExpanded,
      childBlockIds: view.childBlockIds,
      selection: view.selection,
    }),
    initial: {
      isActive: false,
      isSelected: false,
      isExpanded: true,
      childBlockIds: [] as readonly Id.Block[],
      selection: null as {
        anchor: number;
        head: number;
        goalX: number | null;
        goalLine: "first" | "last" | null;
        assoc: -1 | 0 | 1;
      } | null,
    },
  });

  const blockContext = Id.parseBlockContextSync(blockId);
  const bufferId = blockContext.bufferId;
  const nodeId =
    blockContext.type === "buffer"
      ? blockContext.nodeId
      : runtime.runSync(
          Effect.gen(function* () {
            const Tuple = yield* TupleT;
            return yield* Tuple.getDisplayNode(
              blockContext.tupleId,
              blockContext.hostNodeId,
            );
          }),
        );

  // Title link: may display another node's text based on tuple relationships
  const {
    titleMode,
    getYtext,
    getUndoManager,
    textContent,
    start: startTitleLink,
    handleDetach,
  } = useTitleLink({ nodeId, runtime });

  const clickCapture = useClickCapture({ isActive: () => store.isActive });

  const [activeTypes, setActiveTypes] = createSignal<readonly Id.Node[]>([]);

  const getActiveElement = useContext(ActiveElementContext);
  const getPickerState = useContext(PickerStateContext);

  // Push query updates to PickerT when text/selection changes
  createEffect(() => {
    // Track reactive dependencies
    const text = textContent();
    const cursorPos = store.selection?.head ?? text.length;
    const state = getPickerState(); // O(1) context read

    if (!state || state.elementId !== blockId) return;

    const query = text.slice(state.from + 1, cursorPos);
    if (query !== state.query) {
      runtime.runSync(
        Effect.gen(function* () {
          const Picker = yield* PickerT;
          yield* Picker.updateQuery(query);
        }),
      );
    }
  });

  const handleTypePickerOpen = (
    position: { x: number; y: number },
    from: number,
  ) => {
    runtime.runSync(
      Effect.gen(function* () {
        const Picker = yield* PickerT;
        yield* Picker.open(blockId, position, from);
      }),
    );
  };

  const hasType = (typeId: Id.Node) => activeTypes().includes(typeId);
  const userTypes = () =>
    activeTypes().filter((typeId) => !isSystemType(typeId));

  const getActiveDefinitions = () =>
    activeTypes()
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

    // Instant scroll on mount for navigation targets (zoom out, etc.)
    const activeEl = getActiveElement();
    if (activeEl?.type === "block" && activeEl.id === blockId) {
      const blockEl = document.querySelector<HTMLElement>(
        `[data-element-id="${blockId}"][data-element-type="block"]`,
      );
      if (blockEl) {
        const scrollContainer = blockEl.closest<HTMLElement>(
          ".overflow-y-auto, .overflow-auto",
        );
        if (scrollContainer) {
          const containerRect = scrollContainer.getBoundingClientRect();
          const blockRect = blockEl.getBoundingClientRect();
          const topMargin = 80;
          const isOutsideViewport =
            blockRect.top < containerRect.top ||
            blockRect.bottom > containerRect.bottom;

          if (isOutsideViewport) {
            const scrollDelta = blockRect.top - containerRect.top - topMargin;
            scrollContainer.scrollTop += scrollDelta;
          }
        }
      }
    }

    // Start title link subscription (manages Y.Text observation internally)
    const disposeTitleLink = startTitleLink();

    const typesFiber = runtime.runFork(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        const stream = yield* Type.subscribeTypes(nodeId);
        yield* Stream.runForEach(stream, (types) =>
          Effect.sync(() => {
            setActiveTypes(types);
          }),
        );
      }),
    );

    onCleanup(() => {
      dispose();
      disposeTitleLink();
      runtime.runFork(Fiber.interrupt(typesFiber));
      // Close picker if this block has it open (using sync check)
      runtime.runFork(
        Effect.gen(function* () {
          const Picker = yield* PickerT;
          const state = yield* Picker.getState();
          if (state?.elementId === blockId) {
            yield* Picker.close();
          }
        }),
      );
    });
  });

  const { handleFocus, getInitialSelection } = useFocusBlur({
    isActive: () => store.isActive,
    clickCapture,
    runtime,
    onFocusEffect: Effect.gen(function* () {
      const Window = yield* WindowT;
      const Buffer = yield* BufferT;
      // Clear block selection when entering text editing mode
      yield* Buffer.setBlockSelection(bufferId, [], nodeId);
      yield* Window.setActiveElement(
        Option.some({ type: "block" as const, id: blockId }),
      );
    }),
    // Blur is handled by ActionT via handleBlurEvent
    onBlurEffect: Effect.succeed(undefined),
    shouldSkipBlur: () => false,
  });

  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        yield* Block.setExpanded(blockId, !store.isExpanded);
      }),
    );
  };

  const getExistingDecorativeTypeId = (): Id.Node | undefined => {
    const decorativeIds = BlockType.getDecorativeTypeIds();
    return activeTypes().find((typeId) => decorativeIds.includes(typeId));
  };

  const handleTypeTrigger = (
    typeId: Id.Node,
    trigger: BlockType.TriggerDefinition,
  ): boolean => {
    // If node already has THIS exact type, don't trigger (insert literal text)
    if (hasType(typeId)) return false;

    const typeDef = BlockType.get(typeId);

    // If this is a decorative type and node has a DIFFERENT decorative type, replace it
    if (typeDef?.isDecorative) {
      const existingDecorativeId = getExistingDecorativeTypeId();
      if (existingDecorativeId) {
        // Add new type BEFORE removing old to avoid a "no decoration" gap
        // that would trigger both exit and enter animations
        runtime.runPromise(
          Effect.gen(function* () {
            const Type = yield* TypeT;

            yield* Type.addType(nodeId, typeId);
            if (trigger.onTrigger) {
              yield* trigger.onTrigger(nodeId);
            }

            if (existingDecorativeId === System.CHECKBOX) {
              const Tuple = yield* TupleT;
              const isCheckedTuples = yield* Tuple.findByPosition(
                System.IS_CHECKED,
                0,
                nodeId,
              );
              for (const tuple of isCheckedTuples) {
                yield* Tuple.delete(tuple.id);
              }
            }

            yield* Type.removeType(nodeId, existingDecorativeId);
          }),
        );
        return true;
      }
    }

    // Normal case: no decorative type conflict, just add
    runtime.runPromise(
      Effect.gen(function* () {
        const Type = yield* TypeT;
        yield* Type.addType(nodeId, typeId);
        if (trigger.onTrigger) {
          // onTrigger may have dependencies (e.g., TupleT) which are provided by the runtime
          yield* trigger.onTrigger(nodeId);
        }
      }),
    );
    return true;
  };

  /**
   * Handle ;; property trigger - creates a new property section.
   */
  const handlePropertyTrigger = (): boolean => {
    runtime.runPromise(
      Effect.gen(function* () {
        const Buffer = yield* BufferT;
        const View = yield* ViewT;
        const Property = yield* PropertyT;
        const Node = yield* NodeT;
        const Window = yield* WindowT;

        const pageId = yield* Buffer.getAssignedNodeId(bufferId);
        if (pageId === null) return;

        const viewId = yield* View.getOrCreateView(pageId);
        const propertyId = yield* Property.createProperty(viewId);
        yield* Node.deleteNode(nodeId);

        yield* Window.setActiveElement(
          Option.some({
            type: "property" as const,
            propertyId,
            bufferId,
          }),
        );
      }),
    );
    return true;
  };

  /**
   * Execute DOMIntent returned by ActionT.
   * This handles focus, scroll, and blur intents.
   * Uses rAF + setTimeout to ensure DOM has fully updated (for Move operations).
   */
  const executeDOMIntent = (intent: DOMIntent) => {
    const { focus, scroll, blur } = intent;

    // Execute blur
    if (blur) {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement) {
        activeEl.blur();
      }
    }

    // Execute focus - use rAF + setTimeout to wait for DOM updates
    if (focus) {
      if (focus.type === "title") {
        requestAnimationFrame(() =>
          setTimeout(() => {
            const titleEl = document.querySelector<HTMLElement>(
              `[data-element-id="${CSS.escape(focus.bufferId)}"][data-element-type="title"] .cm-content`,
            );
            titleEl?.focus();
          }, 0),
        );
      } else if (focus.type === "block") {
        requestAnimationFrame(() =>
          setTimeout(() => {
            const blockEl = document.querySelector<HTMLElement>(
              `[data-element-id="${CSS.escape(focus.blockId)}"][data-element-type="block"] .cm-content`,
            );
            blockEl?.focus();
          }, 0),
        );
      }
      // type: "none" - no focus change needed
    }

    // Execute scroll
    if (scroll) {
      requestAnimationFrame(() => {
        const blockEl = document.querySelector<HTMLElement>(
          `[data-element-id="${CSS.escape(scroll)}"][data-element-type="block"] [data-block-content]`,
        );
        if (blockEl) {
          blockEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }
  };

  /**
   * Handle keydown events from TextEditor.
   * Builds AppAction and calls ActionT.handle().
   * Returns true if handled, false to let TextEditor/CodeMirror handle.
   */
  const handleKeyDown = (event: KeyboardEvent, view: EditorView): boolean => {
    // Property blocks have different structure (linkedBlockActionHandler).
    // ActionT doesn't understand their navigation, so skip it.
    if (blockId.includes("/property:")) {
      return false;
    }

    // Build AppAction with cursor context
    const cursor = getCursorContext(view);

    // Normalize "Mod" key: ActionT uses `modifiers.meta` to check for "Mod" shortcuts.
    // Accept both metaKey and ctrlKey as "Mod" since tests may send either.
    const modKeyPressed = event.metaKey || event.ctrlKey;

    const action: AppAction = {
      _tag: "KeyDown",
      key: event.key,
      modifiers: {
        meta: modKeyPressed, // Normalized: true when "Mod" key is pressed
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
      },
      source: {
        type: "editor",
        blockId,
        cursor,
      },
    };

    // Call ActionT.handle() synchronously
    const result = runtime.runSync(
      Effect.gen(function* () {
        const Action = yield* ActionT;
        return yield* Action.handle(action);
      }),
    );

    if (result.handled) {
      executeDOMIntent(result.intent);
      return true;
    }

    return false;
  };

  /**
   * Handle selection change from TextEditor via ActionT.
   * Builds AppAction.SelectionChange and calls ActionT.handle().
   */
  const handleSelectionChangeAction = (selection: SelectionInfo) => {
    const action: AppAction = {
      _tag: "SelectionChange",
      selection,
      source: {
        type: "editor",
        blockId,
        cursor: {
          position: selection.head,
          anchor: selection.anchor,
          head: selection.head,
          atStart: selection.anchor === 0 && selection.head === 0,
          atEnd: false, // Not known at this point, but not needed for selection changes
          textBefore: "",
          textAfter: "",
          docText: "",
          lineInfo: {
            line: 0,
            totalLines: 1,
            atFirstLine: true,
            atLastLine: true,
            column: 0,
          },
          coords: null,
          goalX: null,
          assoc: selection.assoc,
        },
      },
    };

    runtime.runSync(
      Effect.gen(function* () {
        const Action = yield* ActionT;
        return yield* Action.handle(action);
      }),
    );
  };

  /**
   * Handle blur from TextEditor.
   * Builds AppAction.Blur and calls ActionT.handle().
   */
  const handleBlurEvent = () => {
    // Don't clear activeElement when window loses focus (alt-tab, tab switch).
    // Only clear when user clicks elsewhere within the document.
    if (!document.hasFocus()) {
      return;
    }

    const action: AppAction = {
      _tag: "Blur",
      source: {
        type: "editor",
        blockId,
        cursor: {
          position: 0,
          anchor: 0,
          head: 0,
          atStart: true,
          atEnd: true,
          textBefore: "",
          textAfter: "",
          docText: "",
          lineInfo: {
            line: 0,
            totalLines: 1,
            atFirstLine: true,
            atLastLine: true,
            column: 0,
          },
          coords: null,
          goalX: null,
          assoc: 0,
        },
      },
    };

    runtime.runSync(
      Effect.gen(function* () {
        const Action = yield* ActionT;
        return yield* Action.handle(action);
      }),
    );
  };

  const hasChildren = () => store.childBlockIds.length > 0;

  return (
    <div data-element-id={blockId} data-element-type="block" class="relative">
      <Show when={hasChildren()}>
        <button
          type="button"
          class="absolute -left-5 top-[calc((var(--text-block)*var(--text-block--line-height)-var(--text-block))/2)] w-5 h-[var(--text-block)] flex items-center justify-center select-none"
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
        onClick={handleFocus}
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
              <p class="font-[family-name:var(--font-sans)] text-[length:var(--text-block)] leading-[var(--text-block--line-height)] min-h-[var(--text-block--line-height)] whitespace-break-spaces">
                <Show when={textContent()} fallback={"\u00A0"}>
                  <FormattedText ytext={getYtext()} />
                </Show>
                <Show when={userTypes().length > 0}>
                  <span class="inline-flex gap-[var(--type-badge-spacing)] ml-[var(--inline-type-gap)]">
                    <For each={userTypes()}>
                      {(typeId) => (
                        <TypeBadge typeId={typeId} nodeId={nodeId} />
                      )}
                    </For>
                  </span>
                </Show>
              </p>
            }
          >
            <TextEditor
              ytext={getYtext()}
              undoManager={getUndoManager()}
              // New primitive callbacks (Phase 5 refactor)
              onKeyDown={handleKeyDown}
              onSelectionChange={handleSelectionChangeAction}
              onBlur={handleBlurEvent}
              // Input handler callbacks
              onTypeTrigger={handleTypeTrigger}
              onPickerOpen={handleTypePickerOpen}
              onPropertyTrigger={handlePropertyTrigger}
              initialStrategy={resolveSelectionStrategy({
                clickCoords: clickCapture.get(),
                domSelection: getInitialSelection(),
                modelSelection: store.selection,
              })}
              selection={store.selection}
              inlineTypes={userTypes()}
              inlineTypesNodeId={nodeId}
              readonly={titleMode() === "readonly"}
              onDetachEdit={titleMode() === "detach" ? handleDetach : undefined}
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
          <Show when={store.childBlockIds.length > 0}>
            <div class="w-max h-0"> </div>
          </Show>
          <For each={store.childBlockIds}>
            {(childId) => <Block blockId={childId} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
