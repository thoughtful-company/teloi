import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { useClickCapture } from "./hooks/useClickCapture";
import { useTitleLink } from "./hooks/useTitleLink";
import { useTypePicker } from "./hooks/useTypePicker";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { BlockT } from "@/services/ui/Block";
import * as BlockType from "@/services/ui/BlockType";
import { BufferT } from "@/services/ui/Buffer";
import { isSystemType, TypePickerT } from "@/services/ui/TypePicker";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import {
  makeCollapsedSelection,
  resolveSelectionStrategy,
  updateEditorSelection,
} from "@/utils/selectionStrategy";
import { Effect, Fiber, Match, Option, Stream } from "effect";
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
import { ActiveElementContext } from "./EditorBuffer";
import { FormattedText } from "./FormattedText";
import TextEditor, {
  type EditorAction,
  type EnterKeyInfo,
  type SelectionInfo,
} from "./TextEditor";
import TypeBadge from "./TypeBadge";
import { TypePicker } from "./TypePicker";

/** Context passed to parent's action handler for navigation decisions */
export interface BlockNavigationContext {
  /** The block ID that emitted the action */
  blockId: Id.Block;
  /** Whether this block is currently expanded (children visible) */
  isExpanded: boolean;
  /** Active block type definitions for this block */
  activeDefinitions: readonly BlockType.BlockTypeDefinition[];
}

interface BlockProps {
  blockId: Id.Block;
  /**
   * Optional parent action handler for tree navigation.
   * Called BEFORE Block's internal handlers.
   * Return `true` to indicate the action was handled (Block skips internal handling).
   * Return `false` or `undefined` to let Block handle it.
   */
  onAction?:
    | ((
        action: EditorAction,
        context: BlockNavigationContext,
      ) => boolean | void)
    | undefined;
}

/**
 * Renders an editable hierarchical block and keeps it synchronized with the application runtime and Yjs document state.
 *
 * The component displays read-only text when inactive and a rich text editor when active; it manages focus, selection, document stream subscription, Y.Text observation, and user editing/navigation behaviors (split/merge, indent/outdent, arrow navigation, zoom) for the given block.
 *
 * @param blockId - The block identifier to render and synchronize (Id.Block)
 * @returns The block's rendered TSX element containing the editor or read-only view and its child blocks
 */
export default function Block({
  blockId,
  onAction: parentOnAction,
}: BlockProps) {
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

  // Type picker
  const {
    pickerState,
    getPickerQuery,
    handleTypePickerOpen,
    handleTypePickerClose,
    handleTypePickerSelect,
    handleTypePickerCreate,
  } = useTypePicker({
    nodeId,
    bufferId,
    elementId: blockId,
    getYtext,
    getSelection: () => store.selection,
    textContent,
    runtime,
    logPrefix: "[Block]",
  });

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
    });
  });

  // Block-specific mutable state (not shared with Title)
  let initialSelection: { anchor: number; head: number } | null = null;
  // Flag to prevent handleBlur from clearing activeElement when transitioning to block selection
  let isTransitioningToBlockSelection = false;

  // Clear initialSelection when block becomes inactive (clickCoords handled by useClickCapture)
  createEffect(() => {
    if (!store.isActive) {
      initialSelection = null;
    }
  });

  const handleFocus = (e: MouseEvent) => {
    clickCapture.capture(e);
    initialSelection = null;

    const domSelection = window.getSelection();
    if (
      domSelection &&
      domSelection.rangeCount > 0 &&
      !domSelection.isCollapsed
    ) {
      const target = e.currentTarget as HTMLElement;
      const paragraph = target.querySelector("p");

      if (
        paragraph &&
        paragraph.contains(domSelection.anchorNode) &&
        paragraph.contains(domSelection.focusNode)
      ) {
        initialSelection = {
          anchor: domSelection.anchorOffset,
          head: domSelection.focusOffset,
        };
      }
    }

    runtime.runPromise(
      Effect.gen(function* () {
                const Window = yield* WindowT;
        const Buffer = yield* BufferT;

        // Clear block selection when entering text editing mode
        yield* Buffer.setBlockSelection(bufferId, [], nodeId);

        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        );
      }),
    );
  };

  // Text changes are now handled directly by Yjs via yCollab extension

  const handleSelectionChange = (selection: SelectionInfo) => {
    runtime.runPromise(updateEditorSelection(bufferId, nodeId, selection));
  };

  const handleBlur = () => {
    console.debug("[Block.handleBlur] Called", {
      blockId,
      hasFocus: document.hasFocus(),
      isTransitioning: isTransitioningToBlockSelection,
    });

    // Don't clear selection when window loses focus (alt-tab, tab switch).
    // Only clear when user clicks elsewhere within the document.
    if (!document.hasFocus()) {
      console.debug("[Block.handleBlur] Document not focused, returning");
      return;
    }

    // Don't clear if we're transitioning to block selection mode (Escape was pressed)
    if (isTransitioningToBlockSelection) {
      console.debug(
        "[Block.handleBlur] Transitioning to block selection, returning",
      );
      return;
    }

    runtime.runPromise(
      Effect.gen(function* () {
                const Buffer = yield* BufferT;
        const Window = yield* WindowT;

        // Only clear selection and activeElement if still pointing to this block.
        // If navigating to another block, they already point there - don't clear.
        const selectionOpt = yield* Buffer.getSelection(bufferId);
        const sel = Option.getOrNull(selectionOpt);
        // Compare full block IDs - works for both buffer and section blocks
        const selBlockId = sel ? sel.anchor.elementId : null;
        console.debug("[Block.handleBlur] Checking selection", {
          blockId,
          selBlockId,
          willClear: sel && selBlockId === blockId,
        });
        if (sel && selBlockId === blockId) {
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Window.setActiveElement(Option.none());
        }
      }),
    );
  };

  const handleEnter = (info: EnterKeyInfo) => {
    runtime.runPromise(
      Effect.gen(function* () {
        
        // Check if any active type wants to be removed on empty Enter
        if (info.cursorPos === 0 && info.textAfter.length === 0) {
          for (const def of getActiveDefinitions()) {
            if (def.enter?.removeOnEmpty) {
              const Type = yield* TypeT;
              yield* Type.removeType(nodeId, def.id);
              return;
            }
          }
        }

        const Block = yield* BlockT;
        const Window = yield* WindowT;
        const Buffer = yield* BufferT;

        const result = yield* Block.split({
          nodeId,
          cursorPos: info.cursorPos,
          textAfter: info.textAfter,
        });

        // Propagate types that want to be propagated
        const Type = yield* TypeT;
        for (const def of getActiveDefinitions()) {
          if (def.enter?.propagateToNewBlock) {
            yield* Type.addType(result.newNodeId, def.id);
          }
        }

        const newBlockId = Id.makeBufferBlockId(bufferId, result.newNodeId);
        yield* Buffer.setSelection(
          bufferId,
          makeCollapsedSelection(newBlockId, result.cursorOffset),
        );
        yield* Window.setActiveElement(
          Option.some({ type: "block" as const, id: newBlockId }),
        );
      }),
    );
  };

  // Only handles type removal - merge logic is in blockActionHandler
  const handleBackspaceAtStart = () => {
    runtime.runPromise(
      Effect.gen(function* () {
        for (const def of getActiveDefinitions()) {
          if (def.backspace?.removeTypeAtStart) {
            const Type = yield* TypeT;
            yield* Type.removeType(nodeId, def.id);
            return;
          }
        }
      }),
    );
  };

  const handleToggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    runtime.runPromise(
      Effect.gen(function* () {
        const Block = yield* BlockT;
        yield* Block.setExpanded(blockId, !store.isExpanded);
      }),
    );
  };

  const enterBlockSelectionMode = () => {
    // Set flag synchronously to prevent handleBlur from clearing activeElement
    isTransitioningToBlockSelection = true;
    // Clear captured selection so Enter returns cursor to model position, not old DOM position
    initialSelection = null;

    runtime
      .runPromise(
        Effect.gen(function* () {
                    const Window = yield* WindowT;
          const Buffer = yield* BufferT;

          // Switch to block selection mode
          yield* Window.setActiveElement(
            Option.some({ type: "buffer" as const, id: bufferId }),
          );
          // Clear text selection - when returning from block selection, cursor should start fresh
          yield* Buffer.setSelection(bufferId, Option.none());
          yield* Buffer.setBlockSelection(bufferId, [nodeId], nodeId);
        }),
      )
      .finally(() => {
        isTransitioningToBlockSelection = false;
      });
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

  const handleAction = (action: EditorAction): boolean | void => {
    // Give parent a chance to handle tree navigation actions first
    if (parentOnAction) {
      const context: BlockNavigationContext = {
        blockId,
        isExpanded: store.isExpanded,
        activeDefinitions: getActiveDefinitions(),
      };
      const handled = parentOnAction(action, context);
      if (handled === true) return true;
    }

    // Block-local action handlers. Tree navigation actions (Tab, Navigate, Move, etc.)
    // are handled by the parent (blockActionHandler.ts) and should never reach here.
    return Match.value(action).pipe(
      Match.tags({
        Enter: ({ info }) => {
          // If picker is open, select the current item
          if (pickerState()) {
            const query = getPickerQuery();
            const availableTypes = runtime.runSync(
              Effect.gen(function* () {
                const TypePicker = yield* TypePickerT;
                const types = yield* TypePicker.getAvailableTypes();
                return TypePicker.filterTypes(types, query);
              }),
            );
            if (availableTypes.length > 0) {
              handleTypePickerSelect(availableTypes[0]!.id);
            } else if (query) {
              handleTypePickerCreate(query);
            }
            return true;
          }
          return handleEnter(info);
        },
        // Type removal on backspace - merge logic is in blockActionHandler
        BackspaceAtStart: () => handleBackspaceAtStart(),
        SelectionChange: ({ selection }) => handleSelectionChange(selection),
        VerticalMove: ({ anchor, head, assoc, goalX }) => {
          // Update model with selection + preserved goalX (for intra-block vertical movement)
          runtime.runPromise(
            Effect.gen(function* () {
              const Buffer = yield* BufferT;
              yield* Buffer.setSelection(
                bufferId,
                Option.some({
                  anchor: { elementId: blockId },
                  anchorOffset: anchor,
                  focus: { elementId: blockId },
                  focusOffset: head,
                  goalX,
                  goalLine: null,
                  assoc,
                }),
              );
            }),
          );
        },
        Blur: () => handleBlur(),
        Escape: () => {
          // If picker is open, close it instead of entering block selection
          if (pickerState()) {
            handleTypePickerClose();
            return;
          }
          enterBlockSelectionMode();
        },
        TypeTrigger: ({ typeId, trigger }) =>
          handleTypeTrigger(typeId, trigger),
        TypePickerOpen: ({ position, from }) =>
          handleTypePickerOpen(position, from),
        TypePickerUpdate: () => {
          // Query is computed reactively from textContent and selection
        },
        TypePickerClose: () => handleTypePickerClose(),
        Expand: () => {
          runtime.runPromise(
            Effect.gen(function* () {
              const Block = yield* BlockT;
              yield* Block.expandOneLevel(bufferId, nodeId);
            }),
          );
        },
        ToggleTodo: () => {
          runtime.runPromise(BlockType.toggleCheckbox(nodeId));
        },
      }),
      // Tree navigation actions are handled by parent (blockActionHandler.ts)
      Match.orElse(() => undefined),
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
              onAction={handleAction}
              initialStrategy={resolveSelectionStrategy({
                clickCoords: clickCapture.get(),
                domSelection: initialSelection,
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
            {(childId) => <Block blockId={childId} onAction={parentOnAction} />}
          </For>
        </div>
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
