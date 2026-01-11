import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { TitleT, type TitleSelection } from "@/services/ui/Title";
import { TypePickerT } from "@/services/ui/TypePicker";
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

  // Get Y.Text and UndoManager for the title node
  const Yjs = runtime.runSync(YjsT);
  const ytext = Yjs.getText(nodeId);
  const undoManager = Yjs.getUndoManager(nodeId);

  // Reactive text content signal for unfocused view
  const [textContent, setTextContent] = createSignal(ytext.toString());

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

    // Observe Y.Text changes for unfocused view
    const observer = () => setTextContent(ytext.toString());
    ytext.observe(observer);

    onCleanup(() => {
      dispose();
      ytext.unobserve(observer);
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

        const cursorPos = store.selection?.head ?? ytext.length;
        const deleteLength = cursorPos - state.from;
        if (deleteLength > 0) {
          ytext.delete(state.from, deleteLength);
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
            Effect.annotateLogs({ bufferId, nodeId, typeId, error: String(err) }),
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

        const cursorPos = store.selection?.head ?? ytext.length;
        const deleteLength = cursorPos - state.from;
        if (deleteLength > 0) {
          ytext.delete(state.from, deleteLength);
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
      Match.tag("Collapse", () => {
        // Find all expanded nodes with no expanded children, collapse them
        runtime.runPromise(
          Effect.gen(function* () {
            const Node = yield* NodeT;
            const Block = yield* BlockT;

            // Find "leaf-adjacent" expanded nodes (expanded, but no expanded children)
            const findLeafAdjacentExpanded = (
              nodes: readonly Id.Node[],
            ): Effect.Effect<Id.Node[], never, NodeT | BlockT> =>
              Effect.gen(function* () {
                const result: Id.Node[] = [];

                for (const currentId of nodes) {
                  const children = yield* Node.getNodeChildren(currentId);
                  if (children.length === 0) continue;

                  const currentBlockId = Id.makeBlockId(bufferId, currentId);
                  const isExpanded = yield* Block.isExpanded(currentBlockId);
                  if (!isExpanded) continue;

                  // Check if any expandable children are expanded
                  let hasExpandedChild = false;
                  for (const childId of children) {
                    const childChildren = yield* Node.getNodeChildren(childId);
                    if (childChildren.length === 0) continue;

                    const childBlockId = Id.makeBlockId(bufferId, childId);
                    if (yield* Block.isExpanded(childBlockId)) {
                      hasExpandedChild = true;
                      break;
                    }
                  }

                  if (hasExpandedChild) {
                    result.push(...(yield* findLeafAdjacentExpanded(children)));
                  } else {
                    result.push(currentId);
                  }
                }

                return result;
              });

            const firstLevel = yield* Node.getNodeChildren(nodeId);
            const toCollapse = yield* findLeafAdjacentExpanded(firstLevel);

            for (const collapseId of toCollapse) {
              const collapseBlockId = Id.makeBlockId(bufferId, collapseId);
              yield* Block.setExpanded(collapseBlockId, false);
            }
          }),
        );
      }),
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
          <h1 class="text-title leading-[var(--text-title--line-height)] font-semibold">
            {textContent()}
          </h1>
        }
      >
        <TextEditor
          ytext={ytext}
          undoManager={undoManager}
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
