import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import * as IdT from "@/schema/id/id";
import { NodeT } from "@/services/domain/Node";
import { useClickCapture } from "./hooks/useClickCapture";
import { useFocusBlur } from "./hooks/useFocusBlur";
import { useTitleLink } from "./hooks/useTitleLink";
import { BlockT } from "@/services/ui/Block";
import { PickerT } from "@/services/ui/Picker";
import { TypePickerT } from "@/services/ui/TypePicker";
import { TitleT, type TitleSelection } from "@/services/ui/Title";
import { NavigationT } from "@/services/ui/Navigation";
import { WindowT } from "@/services/ui/Window";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import {
  resolveSelectionStrategy,
  updateEditorSelection,
} from "@/utils/selectionStrategy";
import { Effect, Match, Option, Stream } from "effect";
import { createEffect, onCleanup, onMount, Show, useContext } from "solid-js";
import { PickerStateContext } from "./EditorBuffer";
import TextEditor, {
  type EditorAction,
  type SelectionInfo,
} from "./TextEditor";

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

  // Title link: may display another node's text based on tuple relationships
  const {
    titleMode,
    getYtext,
    getUndoManager,
    textContent,
    start: startTitleLink,
    handleDetach,
  } = useTitleLink({ nodeId, runtime });

  // Title active state stream
  const titleStream = Stream.unwrap(
    Effect.gen(function* () {
      const Title = yield* TitleT;
      return yield* Title.subscribe(bufferId, nodeId);
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

  // Type picker - Title's elementId is the buffer block ID
  const elementId = IdT.makeBufferBlockId(bufferId, nodeId);
  const getPickerState = useContext(PickerStateContext);

  // Push query updates to PickerT when text/selection changes
  createEffect(() => {
    // Track reactive dependencies
    const text = textContent();
    const cursorPos = store.selection?.head ?? text.length;
    const state = getPickerState(); // O(1) context read

    if (!state || state.elementId !== elementId) return;

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
        yield* Picker.open(elementId, position, from);
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

  /**
   * Handle Enter key when picker might be open.
   * Returns true if picker was open and handled the Enter,
   * false if caller should handle Enter normally.
   */
  const handleEnterWithPicker = (): boolean => {
    const state = getPickerState();
    if (!state || state.elementId !== elementId) return false;

    const availableTypes = runtime.runSync(
      Effect.gen(function* () {
        const TypePicker = yield* TypePickerT;
        const types = yield* TypePicker.getAvailableTypes();
        return TypePicker.filterTypes(types, state.query);
      }),
    );

    if (availableTypes.length > 0) {
      handleTypePickerSelect(availableTypes[0]!.id);
    } else if (state.query) {
      handleTypePickerCreate(state.query);
    }

    return true;
  };

  const clickCapture = useClickCapture({ isActive: () => store.isActive });

  onMount(() => {
    const dispose = start(runtime);
    const disposeTitleLink = startTitleLink();

    onCleanup(() => {
      dispose();
      disposeTitleLink();
      // Close picker if this element has it open (using sync check)
      runtime.runFork(
        Effect.gen(function* () {
          const Picker = yield* PickerT;
          const state = yield* Picker.getState();
          if (state?.elementId === elementId) {
            yield* Picker.close();
          }
        }),
      );
    });
  });

  const { handleFocus, handleBlur, getInitialSelection } = useFocusBlur({
    isActive: () => store.isActive,
    clickCapture,
    runtime,
    onFocusEffect: Effect.gen(function* () {
      const Window = yield* WindowT;
      yield* Window.setActiveElement(
        Option.some({ type: "title" as const, bufferId }),
      );
    }),
    onBlurEffect: Effect.gen(function* () {
      const Title = yield* TitleT;
      yield* Title.blur(bufferId);
    }),
  });

  const handleSelectionChange = (selection: SelectionInfo) => {
    runtime.runPromise(updateEditorSelection(bufferId, nodeId, selection));
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
        const newBlockId = Id.makeBufferBlockId(bufferId, nodeId);
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
        if (handleEnterWithPicker()) return;
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
      Match.tag("Escape", () => {
        // Only close picker if it's open for THIS element
        if (getPickerState()?.elementId === elementId) {
          handleTypePickerClose();
        }
      }),
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

                const childBlockId = Id.makeBufferBlockId(bufferId, childId);
                const isExpanded = yield* Block.isExpanded(childBlockId);
                if (!isExpanded) {
                  collapsedExpandable.push(childId);
                }
              }

              if (collapsedExpandable.length > 0) {
                for (const childId of collapsedExpandable) {
                  const childBlockId = Id.makeBufferBlockId(bufferId, childId);
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
            clickCoords: clickCapture.get(),
            domSelection: getInitialSelection(),
            modelSelection: store.selection,
          })}
          selection={store.selection}
          variant="title"
          readonly={titleMode() === "readonly"}
          onDetachEdit={titleMode() === "detach" ? handleDetach : undefined}
        />
      </Show>
    </div>
  );
}
