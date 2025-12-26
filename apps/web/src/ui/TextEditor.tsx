import { defaultKeymap } from "@codemirror/commands";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createEffect, onCleanup, onMount } from "solid-js";

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

export interface SelectionInfo {
  anchor: number;
  head: number;
}

interface TextEditorProps {
  initialText: string;
  onChange: (text: string) => void;
  onEnter?: (info: EnterKeyInfo) => void;
  onTab?: () => void;
  onShiftTab?: () => void;
  onBackspaceAtStart?: () => void;
  onArrowLeftAtStart?: () => void;
  onArrowRightAtEnd?: () => void;
  onArrowUpOnFirstLine?: (goalX: number) => void;
  onSelectionChange?: (selection: SelectionInfo) => void;
  initialClickCoords?: { x: number; y: number } | null;
  initialSelection?: { anchor: number; head: number } | null;
  selection?: { anchor: number; head: number; goalX?: number | null } | null;
  variant?: TextEditorVariant;
}

export default function TextEditor(props: TextEditorProps) {
  const {
    initialText,
    onChange,
    onEnter,
    onTab,
    onShiftTab,
    onBackspaceAtStart,
    onArrowLeftAtStart,
    onArrowRightAtEnd,
    onArrowUpOnFirstLine,
    onSelectionChange,
    initialClickCoords,
    initialSelection,
    variant = "block",
  } = props;

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
        if (update.selectionSet && onSelectionChange) {
          const { anchor, head } = update.state.selection.main;
          onSelectionChange({ anchor, head });
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

    // Add Tab key handler if callback provided
    if (onTab) {
      extensions.push(
        keymap.of([
          {
            key: "Tab",
            run: () => {
              onTab();
              return true; // Prevent default Tab behavior
            },
          },
        ]),
      );
    }

    if (onShiftTab) {
      extensions.push(
        keymap.of([
          {
            key: "Shift-Tab",
            run: () => {
              onShiftTab();
              return true;
            },
          },
        ]),
      );
    }

    if (onBackspaceAtStart) {
      extensions.push(
        keymap.of([
          {
            key: "Backspace",
            run: (view) => {
              const sel = view.state.selection.main;
              // Only intercept if cursor is at start and no selection
              if (sel.anchor === 0 && sel.head === 0) {
                onBackspaceAtStart();
                return true;
              }
              return false; // Let default handle it
            },
          },
        ]),
      );
    }

    if (onArrowLeftAtStart) {
      extensions.push(
        keymap.of([
          {
            key: "ArrowLeft",
            run: (view) => {
              const sel = view.state.selection.main;
              if (sel.anchor === 0 && sel.head === 0) {
                onArrowLeftAtStart();
                return true;
              }
              return false;
            },
          },
        ]),
      );
    }

    if (onArrowRightAtEnd) {
      extensions.push(
        keymap.of([
          {
            key: "ArrowRight",
            run: (view) => {
              const sel = view.state.selection.main;
              const docLen = view.state.doc.length;
              if (sel.anchor === docLen && sel.head === docLen) {
                onArrowRightAtEnd();
                return true;
              }
              return false;
            },
          },
        ]),
      );
    }

    if (onArrowUpOnFirstLine) {
      extensions.push(
        keymap.of([
          {
            key: "ArrowUp",
            run: (view) => {
              const sel = view.state.selection.main;
              const line = view.state.doc.lineAt(sel.head);
              // Only intercept if on first line
              if (line.number === 1) {
                const cursorCoords = view.coordsAtPos(sel.head);
                const contentRect = view.contentDOM.getBoundingClientRect();
                const goalX = cursorCoords ? cursorCoords.left - contentRect.left : 0;
                onArrowUpOnFirstLine(goalX);
                return true;
              }
              return false;
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

    // Priority: initialSelection (from click with existing selection) >
    // props.selection (from model) > initialClickCoords (from click position)
    if (initialSelection) {
      const docLen = view.state.doc.length;
      const anchor = Math.min(initialSelection.anchor, docLen);
      const head = Math.min(initialSelection.head, docLen);
      view.dispatch({ selection: { anchor, head } });
    } else if (props.selection?.goalX != null) {
      // Use goalX to position cursor based on pixel X coordinate
      const contentRect = view.contentDOM.getBoundingClientRect();
      const targetX = contentRect.left + props.selection.goalX;
      // Get the last line's Y coordinate for positioning
      const lastLine = view.state.doc.line(view.state.doc.lines);
      const lineCoords = view.coordsAtPos(lastLine.from);
      const targetY = lineCoords ? lineCoords.top + 1 : contentRect.top;
      const pos = view.posAtCoords({ x: targetX, y: targetY });
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos } });
      }
    } else if (props.selection) {
      const docLen = view.state.doc.length;
      const anchor = Math.min(props.selection.anchor, docLen);
      const head = Math.min(props.selection.head, docLen);
      view.dispatch({ selection: { anchor, head } });
    } else if (initialClickCoords) {
      const pos = view.posAtCoords(initialClickCoords);
      if (pos !== null) {
        view.dispatch({ selection: { anchor: pos } });
      }
    } else {
      view.dispatch({ selection: { anchor: 0 } });
    }

    view.focus();

    onCleanup(() => view?.destroy());
  });

  // Sync selection from model to CodeMirror
  createEffect(() => {
    const selection = props.selection;
    if (!view || !selection) return;

    // Skip syncing when goalX is set - positioning is handled by mount/effect using posAtCoords
    if (selection.goalX != null) return;

    const currentSel = view.state.selection.main;
    if (
      currentSel.anchor === selection.anchor &&
      currentSel.head === selection.head
    ) {
      return; // Already in sync
    }

    const docLen = view.state.doc.length;
    const anchor = Math.min(selection.anchor, docLen);
    const head = Math.min(selection.head, docLen);
    view.dispatch({ selection: { anchor, head } });
  });

  return <div ref={containerRef} />;
}
