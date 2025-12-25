import { defaultKeymap } from "@codemirror/commands";
import { EditorState, Extension } from "@codemirror/state";
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

export interface EnterKeyInfo {
  /** Text before the cursor position */
  textBefore: string;
  /** Text after the cursor position */
  textAfter: string;
  /** Character position of cursor */
  cursorPos: number;
}

interface TextEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  onEnter?: (info: EnterKeyInfo) => void;
  initialClickCoords?: { x: number; y: number } | null;
  variant?: TextEditorVariant;
}

export default function TextEditor({ initialText, onChange, onEnter, initialClickCoords, variant = "block" }: TextEditorProps) {
  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;

  onMount(() => {
    const extensions: Extension[] = [
      EditorView.lineWrapping,
      variantThemes[variant],
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
        }
      }),
    ];

    // Add Enter key handler if callback provided
    if (onEnter) {
      extensions.push(
        keymap.of([
          {
            key: "Enter",
            run: (view) => {
              const state = view.state;
              const cursorPos = state.selection.main.head;
              const doc = state.doc.toString();
              onEnter({
                cursorPos,
                textBefore: doc.slice(0, cursorPos),
                textAfter: doc.slice(cursorPos),
              });
              return true; // Prevent default Enter behavior
            },
          },
        ]),
      );
    }

    // Default keymap comes after custom handlers
    extensions.push(keymap.of(defaultKeymap));

    const state = EditorState.create({
      doc: initialText,
      extensions,
    });

    view = new EditorView({
      state,
      parent: containerRef,
    });
    view.focus();

    // Position cursor at click location if available
    if (initialClickCoords) {
      const pos = view.posAtCoords(initialClickCoords);
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos } });
      }
    }

    onCleanup(() => view?.destroy());
  });

  return <div ref={containerRef} />;
}
