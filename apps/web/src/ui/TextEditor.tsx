import { useBrowserRuntime } from "@/context/useBrowserRuntime";
import { Id } from "@/schema";
import type { WorkspaceTexts } from "@/services/external/Automerge";
import { createDispatch, type Dispatch } from "@/services/ui/Action";
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
import { onCleanup, onMount } from "solid-js";

export type TextEditorVariant = "block" | "title";

interface VariantStyles {
  fontSize: string;
  lineHeight: string;
  fontWeight?: string;
}

const variantStyles: Record<TextEditorVariant, VariantStyles> = {
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

const variantThemes: Record<TextEditorVariant, Extension> = {
  block: createTheme(variantStyles.block),
  title: createTheme(variantStyles.title),
};

// ============================================================================
// Extension Creators
// ============================================================================

const createUpdateListener = (
  blockId: Id.Block,
  dispatch: Dispatch,
): Extension =>
  EditorView.updateListener.of((update) => {
    if (update.selectionSet) {
      const cursor = getCursorContext(update.view);
      dispatch({
        _tag: "SelectionChange",
        selection: {
          anchor: cursor.anchor,
          head: cursor.head,
          assoc: cursor.assoc,
        },
        source: { type: "editor", blockId, cursor },
      });
    }
    if (update.focusChanged && !update.view.hasFocus) {
      const cursor = getCursorContext(update.view);
      dispatch({
        _tag: "Blur",
        source: { type: "editor", blockId, cursor },
      });
    }
  });

const createKeydownHandler = (
  blockId: Id.Block,
  dispatch: Dispatch,
): Extension =>
  Prec.high(
    EditorView.domEventHandlers({
      keydown(event, editorView) {
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
          return true;
        }
        return false;
      },
    }),
  );

// ============================================================================
// Component
// ============================================================================

interface TextEditorProps {
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
  };
  /** Visual variant */
  variant?: TextEditorVariant;
  /** Whether the editor is readonly */
  readonly?: boolean;
}

/**
 * CodeMirror editor with Automerge CRDT sync.
 *
 * Uses automergeSyncPlugin for real-time collaborative editing.
 * All interactions are handled via ActionT for selection sync with LiveStore
 * and buffer navigation.
 */
export default function TextEditor(props: TextEditorProps) {
  const runtime = useBrowserRuntime();
  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;

  const dispatch = createDispatch(runtime);

  onMount(() => {
    console.debug("[TextEditor] Mounting", {
      blockId: props.blockId,
      path: props.path[1],
      initialSelection: props.initialSelection ?? null,
    });

    const doc = props.handle.doc();
    const initialText = doc?.texts?.[props.path[1]] ?? "";

    const extensions: Extension[] = [
      EditorView.lineWrapping,
      variantThemes[props.variant ?? "block"],
      keymap.of(defaultKeymap),
      automergeSyncPlugin({ handle: props.handle, path: props.path }),
      createUpdateListener(props.blockId, dispatch),
      createKeydownHandler(props.blockId, dispatch),
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
      const { anchor, head } = props.initialSelection;
      console.debug("[TextEditor] Applying initial selection", {
        anchor,
        head,
      });
      view.dispatch({
        selection: EditorSelection.create([
          EditorSelection.range(anchor, head),
        ]),
      });
    }

    requestAnimationFrame(() => {
      if (!view) return;
      console.debug("[TextEditor] Focusing");
      view.focus();
      console.debug("[TextEditor] hasFocus after focus():", view.hasFocus);
    });

    onCleanup(() => view?.destroy());
  });

  return <div ref={containerRef} />;
}
