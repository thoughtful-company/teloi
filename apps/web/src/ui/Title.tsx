import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import * as IdT from "@/schema/id/id";
import { useClickCapture } from "./hooks/useClickCapture";
import { useFocusBlur } from "./hooks/useFocusBlur";
import { useTitleLink } from "./hooks/useTitleLink";
import { PickerT } from "@/services/ui/Picker";
import { TitleT, type TitleSelection } from "@/services/ui/Title";
import { WindowT } from "@/services/ui/Window";
import { ActionT, type AppAction, type DOMIntent } from "@/services/ui/Action";
import { bindStreamToStore } from "@/utils/bindStreamToStore";
import { getCursorContext } from "@/utils/cursorContext";
import { resolveSelectionStrategy } from "@/utils/selectionStrategy";
import { Effect, Option, Stream } from "effect";
import { createEffect, onCleanup, onMount, Show, useContext } from "solid-js";
import { PickerStateContext } from "./EditorBuffer";
import TextEditor, { type SelectionInfo } from "./TextEditor";
import type { EditorView } from "@codemirror/view";

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

  const { handleFocus, getInitialSelection } = useFocusBlur({
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

  /**
   * Execute DOMIntent returned by ActionT.
   * Uses rAF + setTimeout to ensure DOM has fully updated.
   */
  const executeDOMIntent = (intent: DOMIntent) => {
    const { focus, scroll, blur } = intent;

    if (blur) {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLElement) {
        activeEl.blur();
      }
    }

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
    }

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
   * Handle keydown events from TextEditor via ActionT.
   */
  const handleKeyDown = (event: KeyboardEvent, view: EditorView): boolean => {
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
        blockId: elementId,
        cursor,
      },
    };

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
   */
  const handleSelectionChangeAction = (selection: SelectionInfo) => {
    const action: AppAction = {
      _tag: "SelectionChange",
      selection,
      source: {
        type: "editor",
        blockId: elementId,
        cursor: {
          position: selection.head,
          anchor: selection.anchor,
          head: selection.head,
          atStart: selection.anchor === 0 && selection.head === 0,
          atEnd: false,
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
   * Handle blur from TextEditor via ActionT.
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
        blockId: elementId,
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
          // New primitive callbacks (Phase 5 refactor)
          onKeyDown={handleKeyDown}
          onSelectionChange={handleSelectionChangeAction}
          onBlur={handleBlurEvent}
          // Input handler callbacks
          onPickerOpen={handleTypePickerOpen}
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
