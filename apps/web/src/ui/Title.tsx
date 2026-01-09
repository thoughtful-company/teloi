import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import { YjsT } from "@/services/external/Yjs";
import { TitleT, type TitleSelection } from "@/services/ui/Title";
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

  const handleAction = (action: EditorAction): void => {
    Match.value(action).pipe(
      Match.tag("Enter", ({ info }) => {
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
          Match.orElse(() => {}), // Title ignores up/left navigation
        );
      }),
      Match.orElse(() => {}), // Title ignores other actions
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
    </div>
  );
}
