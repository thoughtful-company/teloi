import { defaultKeymap } from "@codemirror/commands";
import { EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { createEffect, onCleanup, onMount } from "solid-js";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import * as Y from "yjs";

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
  /** Cursor association at wrap boundaries: -1 = end of prev line, 1 = start of next line */
  assoc: -1 | 1 | null;
}

interface TextEditorProps {
  /** Yjs Y.Text instance for collaborative text */
  ytext: Y.Text;
  /** Yjs UndoManager for undo/redo */
  undoManager: Y.UndoManager;
  onEnter?: (info: EnterKeyInfo) => void;
  onTab?: () => void;
  onShiftTab?: () => void;
  onBackspaceAtStart?: () => void;
  onDeleteAtEnd?: () => void;
  onArrowLeftAtStart?: () => void;
  onArrowRightAtEnd?: () => void;
  onArrowUpOnFirstLine?: (goalX: number) => void;
  onArrowDownOnLastLine?: (goalX: number) => void;
  onSelectionChange?: (selection: SelectionInfo) => void;
  onZoomIn?: () => void;
  initialClickCoords?: { x: number; y: number } | null;
  initialSelection?: { anchor: number; head: number } | null;
  selection?: { anchor: number; head: number; goalX?: number | null; goalLine?: "first" | "last" | null; assoc?: -1 | 1 | null } | null;
  variant?: TextEditorVariant;
}

/**
 * A collaborative CodeMirror-based text editor component with rich keyboard and selection handling.
 *
 * Renders a CodeMirror editor synchronized with a Yjs `Y.Text` and exposes hooks for navigation,
 * editing, and selection events. Supports two visual variants ("block" and "title"), line-wrapping,
 * yCollab synchronization with an UndoManager, custom handlers for Enter/Tab/Shift-Tab/Backspace/Delete,
 * edge arrow navigation delegation (left/right/up/down), goalX-based vertical cursor positioning, and
 * programmatic initial selection/positioning logic.
 *
 * @param props - Configuration and callbacks for collaboration, keyboard handlers, initial positioning,
 *   and visual variant (see `TextEditorProps`).
 * @returns A div element that contains and hosts the CodeMirror EditorView.
 */
export default function TextEditor(props: TextEditorProps) {
  const {
    ytext,
    undoManager,
    onEnter,
    onTab,
    onShiftTab,
    onBackspaceAtStart,
    onDeleteAtEnd,
    onArrowLeftAtStart,
    onArrowRightAtEnd,
    onArrowUpOnFirstLine,
    onArrowDownOnLastLine,
    onSelectionChange,
    onZoomIn,
    initialClickCoords,
    initialSelection,
    variant = "block",
  } = props;

  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;
  // Suppress onSelectionChange for programmatic selection changes (goalX positioning)
  let suppressSelectionChange = false;

  onMount(() => {
    const extensions: Extension[] = [
      EditorView.lineWrapping,
      variantThemes[variant],
      // Yjs collaborative editing extension - syncs Y.Text with CodeMirror
      yCollab(ytext, null, { undoManager }),
      EditorView.updateListener.of((update) => {
        // Text changes are handled by Yjs, only track selection
        if (update.selectionSet && onSelectionChange && !suppressSelectionChange) {
          const sel = update.state.selection.main;
          // Detect if we're at a wrap boundary by comparing Y coords with different sides
          const coordsBefore = update.view.coordsAtPos(sel.head, -1);
          const coordsAfter = update.view.coordsAtPos(sel.head, 1);
          const isAtWrapBoundary = coordsBefore && coordsAfter && coordsBefore.top !== coordsAfter.top;
          // If at wrap boundary, use CodeMirror's assoc; otherwise null
          const assoc = isAtWrapBoundary ? (sel.assoc as -1 | 1) : null;
          onSelectionChange({ anchor: sel.anchor, head: sel.head, assoc });
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

    if (onDeleteAtEnd) {
      extensions.push(
        keymap.of([
          {
            key: "Delete",
            run: (view) => {
              const sel = view.state.selection.main;
              const docLen = view.state.doc.length;
              // Only intercept if cursor is at end and no selection
              if (sel.anchor === docLen && sel.head === docLen) {
                onDeleteAtEnd();
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

    if (onZoomIn) {
      extensions.push(
        keymap.of([
          {
            key: "Mod-.",
            run: () => {
              onZoomIn();
              return true;
            },
          },
        ]),
      );
    }

    // ArrowUp handler - handles both inter-block navigation and goalX-aware intra-editor navigation
    extensions.push(
      keymap.of([
        {
          key: "ArrowUp",
          run: (view) => {
            const sel = view.state.selection.main;
            // assoc: -1 = end of prev line, 1 = start of next line (at wrap boundaries)
            const side = props.selection?.assoc ?? -1;
            const currentY = view.coordsAtPos(sel.head, side)?.top;
            const moved = view.moveVertically(sel, false);
            const movedY = view.coordsAtPos(moved.head)?.top;

            if (currentY === movedY && onArrowUpOnFirstLine) {
              // On first visual line - delegate to parent
              const cursorCoords = view.coordsAtPos(sel.head, side);
              onArrowUpOnFirstLine(cursorCoords?.left ?? 0);
              return true;
            }

            // Moving between visual lines within editor
            // If we have a goalX, use it instead of CodeMirror's goal column
            if (props.selection?.goalX != null && movedY != null && currentY !== movedY) {
              const pos = view.posAtCoords({ x: props.selection.goalX, y: movedY + 1 });
              if (pos !== null) {
                suppressSelectionChange = true;
                view.dispatch({ selection: { anchor: pos } });
                suppressSelectionChange = false;
                return true;
              }
            }

            return false;
          },
        },
      ]),
    );

    // ArrowDown handler - handles both inter-block navigation and goalX-aware intra-editor navigation
    extensions.push(
      keymap.of([
        {
          key: "ArrowDown",
          run: (view) => {
            const sel = view.state.selection.main;
            // assoc: -1 = end of prev line, 1 = start of next line (at wrap boundaries)
            const side = props.selection?.assoc ?? -1;
            const currentY = view.coordsAtPos(sel.head, side)?.top;
            const moved = view.moveVertically(sel, true);
            const movedY = view.coordsAtPos(moved.head)?.top;

            if (currentY === movedY && onArrowDownOnLastLine) {
              // On last visual line - delegate to parent
              const cursorCoords = view.coordsAtPos(sel.head, side);
              onArrowDownOnLastLine(cursorCoords?.left ?? 0);
              return true;
            }

            // Moving between visual lines within editor
            // If we have a goalX, use it instead of CodeMirror's goal column
            if (props.selection?.goalX != null && movedY != null && currentY !== movedY) {
              const pos = view.posAtCoords({ x: props.selection.goalX, y: movedY + 1 });
              if (pos !== null) {
                suppressSelectionChange = true;
                view.dispatch({ selection: { anchor: pos } });
                suppressSelectionChange = false;
                return true;
              }
            }

            return false;
          },
        },
      ]),
    );

    // Yjs undo manager keymap (Cmd+Z, Cmd+Shift+Z) - must come before defaultKeymap
    extensions.push(keymap.of(yUndoManagerKeymap));

    // Filter out Mod-[ and Mod-] from defaultKeymap to let browser handle back/forward navigation
    const filteredDefaultKeymap = defaultKeymap.filter(
      (binding) => binding.key !== "Mod-[" && binding.key !== "Mod-]",
    );
    extensions.push(keymap.of(filteredDefaultKeymap));

    const state = EditorState.create({
      doc: ytext.toString(),
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
    } else if (props.selection?.goalX != null && props.selection?.goalLine != null) {
      // Use goalX (absolute viewport X) to position cursor on the target line
      // For "first": use position 0 (start of doc) to get Y of first visual line
      // For "last": use doc.length (end of doc) to get Y of last visual line
      const linePos = props.selection.goalLine === "first" ? 0 : view.state.doc.length;
      const lineCoords = view.coordsAtPos(linePos);
      const contentRect = view.contentDOM.getBoundingClientRect();
      const targetY = lineCoords ? lineCoords.top + 1 : contentRect.top;
      const pos = view.posAtCoords({ x: props.selection.goalX, y: targetY });
      if (pos !== null) {
        // Suppress onSelectionChange - this is programmatic positioning for arrow navigation
        suppressSelectionChange = true;
        view.dispatch({ selection: { anchor: pos } });
        suppressSelectionChange = false;
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

    // Skip syncing when goalX and goalLine are set - positioning is handled by mount using posAtCoords
    if (selection.goalX != null && selection.goalLine != null) return;

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

  // Text sync is now handled by Yjs via yCollab extension

  return <div ref={containerRef} />;
}