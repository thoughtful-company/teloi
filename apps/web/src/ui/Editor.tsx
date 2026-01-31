import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import type { WorkspaceTexts } from "@/services/external/Automerge";
import { createDispatch, type Dispatch } from "@/services/ui/Action";
import { KeyEventBusT } from "@/services/ui/KeyEventBus";
import { EditorT } from "@/services/ui/Editor";
import { getCursorContext } from "@/utils/cursorContext";
import { automergeSyncPlugin } from "@automerge/automerge-codemirror";
import type { DocHandle } from "@automerge/automerge-repo";
import { defaultKeymap } from "@codemirror/commands";
import {
  EditorSelection,
  EditorState,
  Extension,
  Prec,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Effect } from "effect";
import { onCleanup, onMount } from "solid-js";

export type EditorVariant = "block" | "title";

interface VariantStyles {
  fontSize: string;
  lineHeight: string;
  fontWeight?: string;
}

const variantStyles: Record<EditorVariant, VariantStyles> = {
  block: {
    fontSize: "var(--text-block)",
    lineHeight: "var(--text-block--line-height)",
  },
  title: {
    fontSize: "var(--text-title)",
    lineHeight: "var(--text-title--line-height)",
    fontWeight: "600",
  },
};

const createTheme = (styles: VariantStyles): Extension =>
  EditorView.theme({
    "&": {
      fontSize: styles.fontSize,
      ...(styles.fontWeight && { fontWeight: styles.fontWeight }),
    },
    ".cm-scroller": {
      fontFamily: "var(--font-sans)",
      lineHeight: styles.lineHeight,
    },
    ".cm-content": {
      padding: "0",
    },
    ".cm-line": {
      padding: "0",
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "currentColor",
    },
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
  });

const variantThemes: Record<EditorVariant, Extension> = {
  block: createTheme(variantStyles.block),
  title: createTheme(variantStyles.title),
};

// ============================================================================
// Routable Keys
// ============================================================================

/**
 * Keys that should be routed through KeyEventBus instead of CodeMirror.
 * These are navigation, structural edits, and potential shortcut triggers.
 */
const ROUTABLE_KEYS = new Set([
  // Navigation
  "ArrowRight",
  "ArrowLeft",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  // Structural
  "Enter",
  "Backspace",
  "Delete",
  "Tab",
  // Control
  "Escape",
]);

/**
 * Check if a key event should be routed through KeyEventBus.
 * Routes if key is in ROUTABLE_KEYS or any modifier (except lone shift) is held.
 */
const isRoutableKey = (key: string, event: KeyboardEvent): boolean => {
  if (ROUTABLE_KEYS.has(key)) return true;
  // Route modifier combos (meta/ctrl/alt, but not shift alone)
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  return false;
};

// ============================================================================
// Extension Creators
// ============================================================================

const createKeydownHandler = (
  blockId: Id.Block,
  dispatch: Dispatch,
  runtime: ReturnType<typeof useBrowserRuntime>,
): Extension =>
  Prec.high(
    EditorView.domEventHandlers({
      keydown(event, editorView) {
        // Routable keys go through KeyEventBus, blocking CodeMirror
        if (isRoutableKey(event.key, event)) {
          const handled = runtime.runSync(
            Effect.gen(function* () {
              const KeyEventBus = yield* KeyEventBusT;
              return yield* KeyEventBus.emit({
                key: event.key,
                modifiers: {
                  meta: event.metaKey,
                  ctrl: event.ctrlKey,
                  alt: event.altKey,
                  shift: event.shiftKey,
                },
                source: { type: "editor", blockId },
              });
            }),
          );
          if (handled) {
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        }

        // Non-routable keys: existing ActionT dispatch (e.g., "#" for type picker)
        const cursor = getCursorContext(editorView);
        const result = dispatch({
          _tag: "KeyDown",
          key: event.key,
          modifiers: {
            meta: event.metaKey,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
          },
          source: { type: "editor", blockId, cursor },
        });
        if (result.handled) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        return false;
      },
    }),
  );

// ============================================================================
// Selection Helpers
// ============================================================================

/**
 * Compute initial EditorSelection from stored selection state.
 * Handles goalX/goalLine for cross-block vertical navigation.
 */
function computeInitialSelection(
  view: EditorView,
  anchor: number,
  head: number,
  assoc: -1 | 0 | 1,
  goalX: number | null | undefined,
  goalLine: "first" | "last" | null | undefined,
): EditorSelection | null {
  // goalLine mode: compute position using goalX + posAtCoords
  if (goalLine != null && goalX != null && view.state.doc.length > 0) {
    const linePos = goalLine === "first" ? 0 : view.state.doc.length;
    const lineCoords = view.coordsAtPos(linePos);
    if (lineCoords) {
      const targetY = lineCoords.top + 1; // +1 to be inside the line
      const result = view.posAndSideAtCoords({ x: goalX, y: targetY });
      if (result != null) {
        return EditorSelection.create([
          EditorSelection.cursor(result.pos, result.assoc),
        ]);
      }
    }
    // Fallback to anchor/head if posAtCoords fails
  }

  // Standard selection: cursor for collapsed, range for extended
  const isCollapsed = anchor === head;
  return EditorSelection.create([
    isCollapsed
      ? EditorSelection.cursor(anchor, assoc)
      : EditorSelection.range(anchor, head),
  ]);
}

// ============================================================================
// Component
// ============================================================================

interface EditorProps {
  /** DocHandle for Automerge sync */
  handle: DocHandle<WorkspaceTexts>;
  /** Path to the text in the Automerge doc (e.g., ["texts", nodeId]) */
  path: ["texts", string];
  /** Block ID for action source context */
  blockId: Id.Block;
  /** Initial selection to apply on mount (from LiveStore) */
  initialSelection?: {
    anchor: number;
    head: number;
    assoc?: -1 | 0 | 1;
    /** Pixel X coordinate for vertical navigation positioning */
    goalX?: number | null;
    /** Target line for goalX positioning: "first" or "last" */
    goalLine?: "first" | "last" | null;
  };
  /** Visual variant */
  variant?: EditorVariant;
  /** Whether the editor is readonly */
  readonly?: boolean;
}

/**
 * CodeMirror editor with Automerge CRDT sync.
 *
 * Uses automergeSyncPlugin for real-time collaborative editing.
 * - Selection/blur state synced via EditorT
 * - Routable keys (navigation, structural) handled via KeyEventBus
 * - Non-routable keys (typing, "#" for picker) handled via ActionT
 */
export default function Editor(props: EditorProps) {
  const runtime = useBrowserRuntime();
  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;

  const dispatch = createDispatch(runtime);

  onMount(() => {
    const editor = runtime.runSync(EditorT);
    const doc = props.handle.doc();
    const initialText = doc?.texts?.[props.path[1]] ?? "";

    const extensions: Extension[] = [
      EditorView.lineWrapping,
      variantThemes[props.variant ?? "block"],
      keymap.of(defaultKeymap),
      automergeSyncPlugin({ handle: props.handle, path: props.path }),
      editor.createExtension(props.blockId, runtime.runSync.bind(runtime)),
      createKeydownHandler(props.blockId, dispatch, runtime),
    ];

    if (props.readonly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    view = new EditorView({
      state: EditorState.create({
        doc: initialText,
        extensions,
      }),
      parent: containerRef,
    });

    if (props.initialSelection) {
      const { anchor, head, assoc, goalX, goalLine } = props.initialSelection;
      const selection = computeInitialSelection(
        view,
        anchor,
        head,
        assoc ?? 0,
        goalX,
        goalLine,
      );
      if (selection) {
        view.dispatch({ selection });
      }
    }

    view.focus();
    runtime.runSync(editor.registerView(view));

    onCleanup(() => {
      // Don't call runSync here - runtime may be disposed during test cleanup
      view?.destroy();
    });
  });

  return <div ref={containerRef} />;
}
