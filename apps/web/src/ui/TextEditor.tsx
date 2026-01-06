import { defaultKeymap } from "@codemirror/commands";
import { EditorSelection, EditorState, Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Id } from "@/schema";
import * as BlockType from "@/services/ui/BlockType";
import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
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
  /** Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line */
  assoc: -1 | 0 | 1;
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
  onBlur?: () => void;
  onZoomIn?: () => void;
  onEscape?: () => void;
  /** Called when Shift+ArrowUp is pressed with focus at offset 0 (transitioning to block selection) */
  onShiftArrowUpFromTextSelection?: () => void;
  /** Called when Shift+ArrowDown is pressed with focus at document end (transitioning to block selection) */
  onShiftArrowDownFromTextSelection?: () => void;
  /** Called when user types a trigger pattern. Return true to handle, false to let normal input through. */
  onTypeTrigger?: (
    typeId: Id.Node,
    trigger: BlockType.TriggerDefinition,
  ) => boolean;
  initialClickCoords?: { x: number; y: number } | null;
  initialSelection?: { anchor: number; head: number } | null;
  selection?: {
    anchor: number;
    head: number;
    goalX?: number | null;
    goalLine?: "first" | "last" | null;
    assoc?: -1 | 0 | 1;
  } | null;
  variant?: TextEditorVariant;
}

/**
 * CodeMirror editor synced with Yjs. Selection is deferred until Yjs syncs
 * (doc transitions from empty to non-empty) to prevent cursor flash at position 0.
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
    onBlur,
    onZoomIn,
    onEscape,
    onShiftArrowUpFromTextSelection,
    onShiftArrowDownFromTextSelection,
    onTypeTrigger,
    initialClickCoords,
    initialSelection,
    variant = "block",
  } = props;

  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;
  // Suppress onSelectionChange for programmatic selection changes (goalX positioning)
  let suppressSelectionChange = false;
  // Track whether selection is ready (doc has content and selection is set)
  // Used to hide cursor until we can position it correctly
  const [isSelectionReady, setIsSelectionReady] = createSignal(false);

  onMount(() => {
    const extensions: Extension[] = [
      EditorView.lineWrapping,
      variantThemes[variant],
      // Yjs collaborative editing extension - syncs Y.Text with CodeMirror
      yCollab(ytext, null, { undoManager }),
      EditorView.updateListener.of((update) => {
        // When doc transitions from empty to non-empty (Yjs synced), apply pending selection.
        // BUT only if we're not already focused - if focused, user is actively typing and
        // we shouldn't reset their selection (this would cause first char to move to end).
        if (
          update.docChanged &&
          update.startState.doc.length === 0 &&
          update.state.doc.length > 0 &&
          !update.view.hasFocus
        ) {
          const sel = props.selection;
          if (sel) {
            const docLen = update.state.doc.length;
            const anchor = Math.min(sel.anchor, docLen);
            const head = Math.min(sel.head, docLen);

            if (anchor === head) {
              setTimeout(() => {
                update.view.dispatch({
                  selection: EditorSelection.create([
                    EditorSelection.cursor(anchor, sel.assoc),
                  ]),
                });
                setIsSelectionReady(true);
                update.view.focus();
              }, 0);
            } else {
              // Use setTimeout to avoid dispatch during update
              // Set selection ready BEFORE focus to avoid cursor flash
              setTimeout(() => {
                update.view.dispatch({ selection: { anchor, head } });
                setIsSelectionReady(true);
                update.view.focus();
              }, 0);
            }
          } else {
            // No saved selection, just focus now that doc has content
            setTimeout(() => {
              setIsSelectionReady(true);
              update.view.focus();
            }, 0);
          }
        }

        // Text changes are handled by Yjs, only track selection
        if (
          update.selectionSet &&
          onSelectionChange &&
          !suppressSelectionChange
        ) {
          // Don't save selection when doc is empty - Yjs hasn't synced yet
          if (update.state.doc.length === 0) return;

          const sel = update.state.selection.main;
          // Detect if we're at a wrap boundary by comparing Y coords with different sides
          const coordsBefore = update.view.coordsAtPos(sel.head, -1);
          const coordsAfter = update.view.coordsAtPos(sel.head, 1);
          const isAtWrapBoundary =
            coordsBefore && coordsAfter && coordsBefore.top !== coordsAfter.top;
          // If at wrap boundary, use CodeMirror's assoc; otherwise null
          const assoc = isAtWrapBoundary ? (sel.assoc as -1 | 1) : 0;
          onSelectionChange({ anchor: sel.anchor, head: sel.head, assoc });
        }
        if (update.focusChanged && !update.view.hasFocus && onBlur) {
          onBlur();
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

    if (onEscape) {
      extensions.push(
        keymap.of([
          {
            key: "Escape",
            run: () => {
              onEscape();
              return true;
            },
          },
        ]),
      );
    }

    if (onShiftArrowUpFromTextSelection) {
      extensions.push(
        keymap.of([
          {
            key: "Shift-ArrowUp",
            run: (view) => {
              const sel = view.state.selection.main;
              // Trigger callback when focus (head) is at offset 0
              if (sel.head === 0) {
                onShiftArrowUpFromTextSelection();
                return true;
              }
              return false; // Let CodeMirror handle normal Shift+ArrowUp selection
            },
          },
        ]),
      );
    }

    if (onShiftArrowDownFromTextSelection) {
      extensions.push(
        keymap.of([
          {
            key: "Shift-ArrowDown",
            run: (view) => {
              const sel = view.state.selection.main;
              const docLen = view.state.doc.length;
              // Trigger callback when focus (head) is at document end
              if (sel.head === docLen) {
                onShiftArrowDownFromTextSelection();
                return true;
              }
              return false; // Let CodeMirror handle normal Shift+ArrowDown selection
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
            // coordsAtPos only accepts -1 | 1, so treat 0 as -1 (default)
            const side = props.selection?.assoc === 1 ? 1 : -1;
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
            if (
              props.selection?.goalX != null &&
              movedY != null &&
              currentY !== movedY
            ) {
              const pos = view.posAtCoords({
                x: props.selection.goalX,
                y: movedY + 1,
              });
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
            const side = props.selection?.assoc === 1 ? 1 : -1;
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
            if (
              props.selection?.goalX != null &&
              movedY != null &&
              currentY !== movedY
            ) {
              const pos = view.posAtCoords({
                x: props.selection.goalX,
                y: movedY + 1,
              });
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

    if (onTypeTrigger) {
      const triggersWithDefinitions = BlockType.getTriggersWithDefinitions();

      extensions.push(
        EditorView.inputHandler.of((view, from, to, text) => {
          if (text !== " ") return false;

          const doc = view.state.doc.toString();

          for (const { definition, trigger } of triggersWithDefinitions) {
            const consumeValues = Array.isArray(trigger.consume)
              ? trigger.consume
              : [trigger.consume];

            for (const consume of consumeValues) {
              if (from === consume && to === consume) {
                const prefix = doc.slice(0, consume);
                if (trigger.pattern.test(prefix)) {
                  if (onTypeTrigger(definition.id, trigger)) {
                    view.dispatch({
                      changes: { from: 0, to: consume, insert: "" },
                      selection: { anchor: 0 },
                    });
                    return true;
                  }
                }
              }
            }
          }
          return false;
        }),
      );
    }

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
    } else if (
      props.selection?.goalX != null &&
      props.selection?.goalLine != null
    ) {
      // Use goalX (absolute viewport X) to position cursor on the target line
      const linePos =
        props.selection.goalLine === "first" ? 0 : view.state.doc.length;
      const lineCoords = view.coordsAtPos(linePos);
      const contentRect = view.contentDOM.getBoundingClientRect();
      const targetY = lineCoords ? lineCoords.top + 1 : contentRect.top;
      const pos = view.posAtCoords({
        x: props.selection.goalX,
        y: targetY,
      });

      if (pos !== null) {
        suppressSelectionChange = true;
        view.dispatch({ selection: { anchor: pos } });
        suppressSelectionChange = false;
      }
    } else if (props.selection) {
      const docLen = view.state.doc.length;
      // If doc is empty (Yjs hasn't synced yet), the updateListener will apply selection when content arrives
      if (docLen > 0) {
        const anchor = Math.min(props.selection.anchor, docLen);
        const head = Math.min(props.selection.head, docLen);

        // Suppress onSelectionChange - this is syncing FROM model, not user input
        suppressSelectionChange = true;
        if (anchor === head) {
          view.dispatch({
            selection: EditorSelection.create([
              EditorSelection.cursor(anchor, props.selection.assoc),
            ]),
          });
        } else {
          view.dispatch({ selection: { anchor, head } });
        }
        suppressSelectionChange = false;
      }
    } else if (initialClickCoords) {
      // Only use click coords if doc has content - clicking on empty doc is meaningless
      // and the saved selection will be restored when Yjs syncs
      const docLen = view.state.doc.length;

      if (docLen > 0) {
        const { pos, assoc } = view.posAndSideAtCoords(initialClickCoords) || {
          pos: null,
          assoc: 0,
        };
        if (pos !== null) {
          view.dispatch({
            selection: EditorSelection.create([
              EditorSelection.cursor(pos, assoc),
            ]),
          });
        }
      }
    } else if (view.state.doc.length > 0) {
      // Only default to position 0 if doc has content
      // Otherwise, let updateListener set selection when Yjs syncs
      // Suppress onSelectionChange to avoid overwriting pending selection from model
      suppressSelectionChange = true;
      view.dispatch({ selection: { anchor: 0 } });
      suppressSelectionChange = false;
    }

    // Focus logic: balance cursor flash prevention with immediate focus for new blocks
    const docLen = view.state.doc.length;

    if (docLen > 0) {
      // Content already loaded - focus immediately
      setIsSelectionReady(true);
      view.focus();
    } else {
      // Doc is empty - check if we're expecting content from Yjs
      // If saved selection is beyond position 0, there must be content waiting to sync
      const expectingContent = props.selection && props.selection.anchor > 0;

      if (!expectingContent) {
        // New empty block or empty block at position 0 - focus immediately
        setIsSelectionReady(true);
        view.focus();
      }
      // else: wait for updateListener to focus after Yjs syncs
    }

    onCleanup(() => view?.destroy());
  });

  // Sync selection from model to CodeMirror
  createEffect(() => {
    const selection = props.selection;
    if (!view || !selection) return;

    const docLen = view.state.doc.length;

    // When goalX and goalLine are set, apply goalX positioning using posAtCoords.
    // This handles the race condition where goalX arrives after mount.
    if (selection.goalX != null && selection.goalLine != null) {
      if (docLen > 0) {
        const linePos = selection.goalLine === "first" ? 0 : docLen;
        const lineCoords = view.coordsAtPos(linePos);
        const contentRect = view.contentDOM.getBoundingClientRect();
        const targetY = lineCoords ? lineCoords.top + 1 : contentRect.top;
        const pos = view.posAtCoords({ x: selection.goalX, y: targetY });

        if (pos !== null) {
          suppressSelectionChange = true;
          view.dispatch({ selection: { anchor: pos } });
          suppressSelectionChange = false;
        }
      }
      return;
    }

    // Only sync selection when doc has content - empty doc means Yjs hasn't synced yet
    // (The updateListener will handle selection when Yjs syncs)
    if (docLen > 0) {
      const currentSel = view.state.selection.main;
      const needsUpdate =
        currentSel.anchor !== selection.anchor ||
        currentSel.head !== selection.head ||
        currentSel.assoc !== selection.assoc;

      if (needsUpdate) {
        const anchor = Math.min(selection.anchor, docLen);
        const head = Math.min(selection.head, docLen);
        // Use EditorSelection.cursor to preserve assoc for collapsed selections
        const newSel =
          anchor === head
            ? EditorSelection.cursor(head, selection.assoc)
            : EditorSelection.range(anchor, head);
        // Suppress onSelectionChange - this is syncing FROM model, not user input
        suppressSelectionChange = true;
        view.dispatch({ selection: EditorSelection.create([newSel]) });
        suppressSelectionChange = false;
      }
    }

    // Ensure focus when selection prop is set (e.g., after body click)
    // BUT: if doc is empty and selection > 0, we're waiting for Yjs to sync.
    // In that case, updateListener will handle focus after sync.
    const expectingContent = docLen === 0 && selection.anchor > 0;
    if (!view.hasFocus && !expectingContent) {
      view.focus();
    }
  });

  // Text sync is now handled by Yjs via yCollab extension

  return (
    <div
      ref={containerRef}
      style={{
        // Hide cursor until selection is ready to avoid flash at position 0
        "caret-color": isSelectionReady() ? undefined : "transparent",
      }}
    />
  );
}
