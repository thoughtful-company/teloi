import { defaultKeymap } from "@codemirror/commands";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  keymap,
  WidgetType,
} from "@codemirror/view";
import { Id } from "@/schema";
import * as BlockType from "@/services/ui/BlockType";
import { SelectionStrategy } from "@/utils/selectionStrategy";
import { createEffect, createSignal, For, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import TypeBadge from "./TypeBadge";
import * as Y from "yjs";

export type TextEditorVariant = "block" | "title";

// === Keymap Condition Types ===

type KeymapCondition =
  | "always"
  | "atStart" // anchor === 0 && head === 0
  | "atEnd" // anchor === docLen && head === docLen
  | "headAtStart" // head === 0
  | "headAtEnd"; // head === docLen

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

// === Text Formatting Marks ===

/** Mark decoration for bold text */
const boldMark = Decoration.mark({ class: "cm-bold" });

/** Theme extension for formatting marks */
const formattingTheme = EditorView.theme({
  ".cm-bold": {
    fontWeight: "700",
  },
});

/** Effect to trigger a full rebuild of formatting decorations from Y.Text */
const rebuildFormattingEffect = StateEffect.define<Y.Text>();

/** Delta from Y.Text with optional formatting attributes */
type YTextDelta = { insert: string; attributes?: { bold?: true } };

/** Check if a position in Y.Text has bold formatting */
function isBoldAtPosition(ytext: Y.Text, position: number): boolean {
  const deltas = ytext.toDelta() as YTextDelta[];
  let pos = 0;
  for (const delta of deltas) {
    const deltaEnd = pos + delta.insert.length;
    if (position >= pos && position < deltaEnd) {
      return delta.attributes?.bold === true;
    }
    pos = deltaEnd;
  }
  return false;
}

/** Check if entire range in Y.Text is bold */
function isRangeBold(ytext: Y.Text, from: number, to: number): boolean {
  const deltas = ytext.toDelta() as YTextDelta[];
  let pos = 0;
  for (const delta of deltas) {
    const deltaEnd = pos + delta.insert.length;
    // Check if this delta overlaps with the range
    if (deltaEnd > from && pos < to) {
      if (!delta.attributes?.bold) return false;
    }
    pos = deltaEnd;
    if (pos >= to) break;
  }
  return true;
}

/** Build decorations from Y.Text formatting deltas */
function createFormattingDecorations(ytext: Y.Text): DecorationSet {
  const deltas = ytext.toDelta() as YTextDelta[];
  const ranges: ReturnType<typeof boldMark.range>[] = [];
  let pos = 0;

  for (const delta of deltas) {
    const length = delta.insert.length;
    if (delta.attributes?.bold) {
      ranges.push(boldMark.range(pos, pos + length));
    }
    pos += length;
  }

  return Decoration.set(ranges, true);
}

/**
 * StateField that holds formatting decorations and maps them through changes.
 * - On text changes: maps existing decorations to new positions (O(1) per change)
 * - On rebuildFormattingEffect: rebuilds from Y.Text deltas (O(n) but only on format change)
 */
const createFormattingField = (ytext: Y.Text) =>
  StateField.define<DecorationSet>({
    create: () => createFormattingDecorations(ytext),
    update: (decorations, tr) => {
      // Check if we need to rebuild from Y.Text (formatting changed)
      for (const effect of tr.effects) {
        if (effect.is(rebuildFormattingEffect)) {
          return createFormattingDecorations(effect.value);
        }
      }
      // Otherwise, just map through document changes (fast!)
      return decorations.map(tr.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });

// === Inline Type Badge Widget ===

class InlineTypeBadgeWidget extends WidgetType {
  private dispose?: () => void;

  constructor(
    private types: readonly Id.Node[],
    private nodeId: Id.Node,
  ) {
    super();
  }

  toDOM() {
    const container = document.createElement("span");
    container.className = "inline-type-badges ml-1";

    // Mount Solid component into the container
    this.dispose = render(
      () => (
        <For each={this.types}>
          {(typeId) => <TypeBadge typeId={typeId} nodeId={this.nodeId} />}
        </For>
      ),
      container,
    );

    return container;
  }

  destroy() {
    this.dispose?.();
  }

  eq(other: InlineTypeBadgeWidget) {
    if (this.nodeId !== other.nodeId) return false;
    if (this.types.length !== other.types.length) return false;
    for (let i = 0; i < this.types.length; i++) {
      if (this.types[i] !== other.types[i]) return false;
    }
    return true;
  }
}

function createTypeBadgeDecorations(
  state: { doc: { length: number } },
  types: readonly Id.Node[],
  nodeId: Id.Node,
): DecorationSet {
  if (types.length === 0) return Decoration.none;
  const widget = Decoration.widget({
    widget: new InlineTypeBadgeWidget(types, nodeId),
    side: 1,
  }).range(state.doc.length);
  return Decoration.set([widget]);
}

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

// === Editor Actions (Discriminated Union) ===

export type EditorAction =
  | { _tag: "Enter"; info: EnterKeyInfo }
  | { _tag: "Tab" }
  | { _tag: "ShiftTab" }
  | { _tag: "BackspaceAtStart" }
  | { _tag: "DeleteAtEnd" }
  | {
      _tag: "Navigate";
      direction: "left" | "right" | "up" | "down";
      goalX?: number;
    }
  | { _tag: "SelectionChange"; selection: SelectionInfo }
  | {
      _tag: "VerticalMove";
      anchor: number;
      head: number;
      assoc: -1 | 0 | 1;
      goalX: number;
    }
  | { _tag: "Blur" }
  | { _tag: "Escape" }
  | { _tag: "ZoomIn" }
  | { _tag: "BlockSelect"; direction: "up" | "down" }
  | { _tag: "Move"; action: "swapUp" | "swapDown" | "first" | "last" }
  | {
      _tag: "TypeTrigger";
      typeId: Id.Node;
      trigger: BlockType.TriggerDefinition;
    }
  | {
      _tag: "TypePickerOpen";
      position: { x: number; y: number };
      from: number;
    }
  | { _tag: "TypePickerUpdate"; query: string }
  | { _tag: "TypePickerClose" };

/** Action constructors for type-safe action creation */
export const Action = {
  Enter: (info: EnterKeyInfo): EditorAction => ({ _tag: "Enter", info }),
  Tab: (): EditorAction => ({ _tag: "Tab" }),
  ShiftTab: (): EditorAction => ({ _tag: "ShiftTab" }),
  BackspaceAtStart: (): EditorAction => ({ _tag: "BackspaceAtStart" }),
  DeleteAtEnd: (): EditorAction => ({ _tag: "DeleteAtEnd" }),
  Navigate: (
    direction: "left" | "right" | "up" | "down",
    goalX?: number,
  ): EditorAction =>
    goalX !== undefined
      ? { _tag: "Navigate", direction, goalX }
      : { _tag: "Navigate", direction },
  SelectionChange: (selection: SelectionInfo): EditorAction => ({
    _tag: "SelectionChange",
    selection,
  }),
  VerticalMove: (
    anchor: number,
    head: number,
    assoc: -1 | 0 | 1,
    goalX: number,
  ): EditorAction => ({
    _tag: "VerticalMove",
    anchor,
    head,
    assoc,
    goalX,
  }),
  Blur: (): EditorAction => ({ _tag: "Blur" }),
  Escape: (): EditorAction => ({ _tag: "Escape" }),
  ZoomIn: (): EditorAction => ({ _tag: "ZoomIn" }),
  BlockSelect: (direction: "up" | "down"): EditorAction => ({
    _tag: "BlockSelect",
    direction,
  }),
  Move: (action: "swapUp" | "swapDown" | "first" | "last"): EditorAction => ({
    _tag: "Move",
    action,
  }),
  TypeTrigger: (
    typeId: Id.Node,
    trigger: BlockType.TriggerDefinition,
  ): EditorAction => ({ _tag: "TypeTrigger", typeId, trigger }),
  TypePickerOpen: (
    position: { x: number; y: number },
    from: number,
  ): EditorAction => ({ _tag: "TypePickerOpen", position, from }),
  TypePickerUpdate: (query: string): EditorAction => ({
    _tag: "TypePickerUpdate",
    query,
  }),
  TypePickerClose: (): EditorAction => ({ _tag: "TypePickerClose" }),
} as const;

interface TextEditorProps {
  /** Yjs Y.Text instance for collaborative text */
  ytext: Y.Text;
  /** Yjs UndoManager for undo/redo */
  undoManager: Y.UndoManager;
  /** Single handler for all editor actions */
  onAction?: (action: EditorAction) => boolean | void;
  /** Strategy for initial cursor positioning on mount */
  initialStrategy: SelectionStrategy;
  /** Reactive selection from model (for ongoing sync after mount) */
  selection?: {
    anchor: number;
    head: number;
    goalX?: number | null;
    goalLine?: "first" | "last" | null;
    assoc?: -1 | 0 | 1;
  } | null;
  variant?: TextEditorVariant;
  /** Type IDs to display as inline badges at end of content */
  inlineTypes?: readonly Id.Node[];
  /** Node ID for type badge removal (required if inlineTypes provided) */
  inlineTypesNodeId?: Id.Node;
}

/**
 * CodeMirror editor synced with Yjs. Selection is deferred until Yjs syncs
 * (doc transitions from empty to non-empty) to prevent cursor flash at position 0.
 */
export default function TextEditor(props: TextEditorProps) {
  const {
    ytext,
    undoManager,
    onAction,
    initialStrategy,
    variant = "block",
  } = props;

  /** Emit an action, returning true if handled */
  const emit = (action: EditorAction): boolean => {
    const result = onAction?.(action);
    return result === true;
  };

  let containerRef!: HTMLDivElement;
  let view: EditorView | undefined;
  // Suppress onSelectionChange for programmatic selection changes (goalX positioning)
  let suppressSelectionChange = false;
  // When mounting without props.selection but expecting one to arrive (programmatic navigation),
  // suppress selection changes until createEffect syncs the model selection.
  // This prevents race conditions where yCollab or default cursor positioning overwrites
  // a pending selection from the model (e.g., merge point after backspace).
  let awaitingSelectionFromModel = false;
  // Track whether selection is ready (doc has content and selection is set)
  // Used to hide cursor until we can position it correctly
  const [isSelectionReady, setIsSelectionReady] = createSignal(false);

  // Pending bold state for cursor-only Cmd+B toggle
  // null = inherit from position, true = force bold, false = force plain
  let pendingBold: boolean | null = null;
  // Track cursor position when pending was set - clear if cursor moves
  let pendingBoldPosition: number | null = null;

  // Compartment for inline type badges - allows dynamic reconfiguration
  const typeBadgeCompartment = new Compartment();

  onMount(() => {
    const extensions: Extension[] = [
      EditorView.lineWrapping,
      variantThemes[variant],
      formattingTheme,
      // Text formatting decorations - StateField maps through changes automatically
      createFormattingField(ytext),
      // Inline type badges widget extension
      typeBadgeCompartment.of(
        props.inlineTypes?.length && props.inlineTypesNodeId
          ? EditorView.decorations.compute(["doc"], (state) =>
              createTypeBadgeDecorations(
                state,
                props.inlineTypes!,
                props.inlineTypesNodeId!,
              ),
            )
          : [],
      ),
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
                suppressSelectionChange = true;
                update.view.dispatch({
                  selection: EditorSelection.create([
                    EditorSelection.cursor(anchor, sel.assoc),
                  ]),
                });
                setIsSelectionReady(true);
                update.view.focus();
                suppressSelectionChange = false;
              }, 0);
            } else {
              // Use setTimeout to avoid dispatch during update
              // Set selection ready BEFORE focus to avoid cursor flash
              setTimeout(() => {
                suppressSelectionChange = true;
                update.view.dispatch({ selection: { anchor, head } });
                setIsSelectionReady(true);
                update.view.focus();
                suppressSelectionChange = false;
              }, 0);
            }
          } else {
            // No saved selection, just focus now that doc has content
            setTimeout(() => {
              setIsSelectionReady(true);
              suppressSelectionChange = true;
              update.view.focus();
              suppressSelectionChange = false;
            }, 0);
          }
        }

        // Handle pending bold formatting after text insertion
        if (update.docChanged && pendingBold !== null) {
          let shouldClearPending = true;

          update.changes.iterChanges((fromA, toA, fromB, toB) => {
            const insertedLength = toB - fromB;
            const deletedLength = toA - fromA;

            // Only apply formatting to pure insertions (not replacements or deletions)
            if (insertedLength > 0 && deletedLength === 0) {
              ytext.format(fromB, insertedLength, {
                bold: pendingBold ? true : null,
              });
              setTimeout(() => {
                view?.dispatch({
                  effects: rebuildFormattingEffect.of(ytext),
                });
              }, 0);
              // Keep pending for continued typing
              shouldClearPending = false;
              pendingBoldPosition = update.state.selection.main.head;
            }
          });

          if (shouldClearPending) {
            pendingBold = null;
            pendingBoldPosition = null;
          }
        }

        // Clear pending bold if cursor moved without typing
        if (
          update.selectionSet &&
          !update.docChanged &&
          pendingBoldPosition !== null &&
          update.state.selection.main.head !== pendingBoldPosition
        ) {
          pendingBold = null;
          pendingBoldPosition = null;
        }

        // Log ALL selection changes for debugging
        if (update.selectionSet) {
          const sel = update.state.selection.main;
          console.debug("[TextEditor.updateListener] Selection changed", {
            anchor: sel.anchor,
            head: sel.head,
            suppressed: suppressSelectionChange,
            docChanged: update.docChanged,
          });
        }

        // Text changes are handled by Yjs, only track selection
        if (
          update.selectionSet &&
          !suppressSelectionChange &&
          !awaitingSelectionFromModel
        ) {
          // Don't save selection when doc is empty - Yjs hasn't synced yet
          if (update.state.doc.length === 0) return;

          const sel = update.state.selection.main;

          console.debug("[TextEditor.updateListener] Selection change firing", {
            anchor: sel.anchor,
            head: sel.head,
            docLen: update.state.doc.length,
            docChanged: update.docChanged,
          });

          // Detect if we're at a wrap boundary by comparing Y coords with different sides
          const coordsBefore = update.view.coordsAtPos(sel.head, -1);
          const coordsAfter = update.view.coordsAtPos(sel.head, 1);
          const isAtWrapBoundary =
            coordsBefore && coordsAfter && coordsBefore.top !== coordsAfter.top;
          // If at wrap boundary, use CodeMirror's assoc; otherwise null
          const assoc = isAtWrapBoundary ? (sel.assoc as -1 | 1) : 0;
          emit(
            Action.SelectionChange({
              anchor: sel.anchor,
              head: sel.head,
              assoc,
            }),
          );
        }
        if (update.focusChanged && !update.view.hasFocus) {
          console.debug(
            "[TextEditor.updateListener] Blur detected, emitting Blur action",
          );
          emit(Action.Blur());
        }
      }),
    ];

    // Declarative keymap configuration - emits actions
    interface ActionKeyDef {
      key: string;
      action: EditorAction | ((view: EditorView) => EditorAction);
      condition?: KeymapCondition;
    }

    const actionKeyDefs: ActionKeyDef[] = [
      // Enter - extracts cursor info
      {
        key: "Enter",
        action: (view) => {
          const cursorPos = view.state.selection.main.head;
          const doc = view.state.doc.toString();
          return Action.Enter({
            cursorPos,
            textBefore: doc.slice(0, cursorPos),
            textAfter: doc.slice(cursorPos),
          });
        },
      },

      // Simple keybindings (always fire)
      { key: "Tab", action: Action.Tab() },
      { key: "Shift-Tab", action: Action.ShiftTab() },
      { key: "Mod-.", action: Action.ZoomIn() },
      { key: "Escape", action: Action.Escape() },
      { key: "Alt-Mod-ArrowUp", action: Action.Move("swapUp") },
      { key: "Alt-Mod-ArrowDown", action: Action.Move("swapDown") },
      { key: "Shift-Alt-Mod-ArrowUp", action: Action.Move("first") },
      { key: "Shift-Alt-Mod-ArrowDown", action: Action.Move("last") },

      // Position-conditional (anchor AND head at position)
      {
        key: "Backspace",
        action: Action.BackspaceAtStart(),
        condition: "atStart",
      },
      {
        key: "ArrowLeft",
        action: Action.Navigate("left"),
        condition: "atStart",
      },
      { key: "Delete", action: Action.DeleteAtEnd(), condition: "atEnd" },
      {
        key: "ArrowRight",
        action: Action.Navigate("right"),
        condition: "atEnd",
      },

      // Head-only conditional (for extending selection)
      {
        key: "Shift-ArrowUp",
        action: Action.BlockSelect("up"),
        condition: "headAtStart",
      },
      {
        key: "Shift-ArrowDown",
        action: Action.BlockSelect("down"),
        condition: "headAtEnd",
      },
    ];

    // Build keymaps from action definitions
    for (const def of actionKeyDefs) {
      extensions.push(
        keymap.of([
          {
            key: def.key,
            run: (view) => {
              const sel = view.state.selection.main;
              const docLen = view.state.doc.length;

              // Check condition
              switch (def.condition) {
                case "atStart":
                  if (sel.anchor !== 0 || sel.head !== 0) return false;
                  break;
                case "atEnd":
                  if (sel.anchor !== docLen || sel.head !== docLen)
                    return false;
                  break;
                case "headAtStart":
                  if (sel.head !== 0) return false;
                  break;
                case "headAtEnd":
                  if (sel.head !== docLen) return false;
                  break;
              }

              // Emit action
              const action =
                typeof def.action === "function"
                  ? def.action(view)
                  : def.action;
              emit(action);
              return true;
            },
          },
        ]),
      );
    }

    // Cmd+B: Toggle bold formatting on selection or set pending bold for cursor
    extensions.push(
      keymap.of([
        {
          key: "Mod-b",
          run: (view) => {
            const sel = view.state.selection.main;
            const from = Math.min(sel.anchor, sel.head);
            const to = Math.max(sel.anchor, sel.head);

            if (from === to) {
              // Cursor only - toggle pending bold for future typing
              // Yjs inherits formatting from the character BEFORE the cursor
              const wouldInheritBold = isBoldAtPosition(
                ytext,
                from > 0 ? from - 1 : 0,
              );
              pendingBold =
                pendingBold !== null ? !pendingBold : !wouldInheritBold;
              pendingBoldPosition = from;
              return true;
            }

            // Toggle: if all selected text is bold, remove bold; otherwise apply bold
            const shouldRemoveBold = isRangeBold(ytext, from, to);
            ytext.format(from, to - from, {
              bold: shouldRemoveBold ? null : true,
            });

            view.dispatch({
              effects: rebuildFormattingEffect.of(ytext),
            });

            return true;
          },
        },
      ]),
    );

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
            const currentCoords = view.coordsAtPos(sel.head, side);
            const currentY = currentCoords?.top;
            const moved = view.moveVertically(sel, false);
            // Use moved.assoc for movedY to get correct line when landing at wrap boundary
            const movedSide = moved.assoc === 1 ? 1 : -1;
            const movedY = view.coordsAtPos(moved.head, movedSide)?.top;

            if (currentY === movedY) {
              // On first visual line - delegate to parent
              emit(Action.Navigate("up", currentCoords?.left ?? 0));
              return true;
            }

            // Moving between visual lines within editor
            if (movedY != null && currentY !== movedY) {
              // Preserve existing goalX or use current cursor X
              const goalX = props.selection?.goalX ?? currentCoords?.left ?? 0;

              // If we have a goalX, use it to position cursor at that X coordinate
              let finalPos = moved.head;

              if (props.selection?.goalX != null) {
                const pos = view.posAtCoords({
                  x: props.selection.goalX,
                  y: movedY + 1,
                });
                if (pos !== null) {
                  finalPos = pos;
                }
              }

              // Determine assoc: if at wrap boundary, pick assoc so cursor stays on target line (movedY)
              const coordsBefore = view.coordsAtPos(finalPos, -1);
              const coordsAfter = view.coordsAtPos(finalPos, 1);
              const isAtWrapBoundary =
                coordsBefore &&
                coordsAfter &&
                coordsBefore.top !== coordsAfter.top;
              let finalAssoc: -1 | 0 | 1 = 0;
              if (isAtWrapBoundary) {
                // Pick assoc that keeps cursor on the target visual line
                finalAssoc = coordsBefore?.top === movedY ? -1 : 1;
              }

              // Suppress selection change - we'll emit VerticalMove instead
              suppressSelectionChange = true;
              view.dispatch({
                selection: EditorSelection.create([
                  EditorSelection.cursor(finalPos, finalAssoc),
                ]),
              });
              suppressSelectionChange = false;

              // Emit VerticalMove to update model with goalX preserved
              emit(Action.VerticalMove(finalPos, finalPos, finalAssoc, goalX));
              return true;
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
            // coordsAtPos only accepts -1 | 1, so treat 0 as -1 (default)
            const side = props.selection?.assoc === 1 ? 1 : -1;
            const currentCoords = view.coordsAtPos(sel.head, side);
            const currentY = currentCoords?.top;
            const moved = view.moveVertically(sel, true);
            // Use moved.assoc for movedY to get correct line when landing at wrap boundary
            const movedSide = moved.assoc === 1 ? 1 : -1;
            const movedY = view.coordsAtPos(moved.head, movedSide)?.top;

            if (currentY === movedY) {
              // On last visual line - delegate to parent
              emit(Action.Navigate("down", currentCoords?.left ?? 0));
              return true;
            }

            // Moving between visual lines within editor
            if (movedY != null && currentY !== movedY) {
              // Preserve existing goalX or use current cursor X
              const goalX = props.selection?.goalX ?? currentCoords?.left ?? 0;

              // If we have a goalX, use it to position cursor at that X coordinate
              let finalPos = moved.head;

              if (props.selection?.goalX != null) {
                const pos = view.posAtCoords({
                  x: props.selection.goalX,
                  y: movedY + 1,
                });
                if (pos !== null) {
                  finalPos = pos;
                }
              }

              // Determine assoc: if at wrap boundary, pick assoc so cursor stays on target line (movedY)
              const coordsBefore = view.coordsAtPos(finalPos, -1);
              const coordsAfter = view.coordsAtPos(finalPos, 1);
              const isAtWrapBoundary =
                coordsBefore &&
                coordsAfter &&
                coordsBefore.top !== coordsAfter.top;
              let finalAssoc: -1 | 0 | 1 = 0;
              if (isAtWrapBoundary) {
                // Pick assoc that keeps cursor on the target visual line
                finalAssoc = coordsBefore?.top === movedY ? -1 : 1;
              }

              // Suppress selection change - we'll emit VerticalMove instead
              suppressSelectionChange = true;
              view.dispatch({
                selection: EditorSelection.create([
                  EditorSelection.cursor(finalPos, finalAssoc),
                ]),
              });
              suppressSelectionChange = false;

              // Emit VerticalMove to update model with goalX preserved
              emit(Action.VerticalMove(finalPos, finalPos, finalAssoc, goalX));
              return true;
            }

            return false;
          },
        },
      ]),
    );

    // Yjs undo manager keymap (Cmd+Z, Cmd+Shift+Z) - must come before defaultKeymap
    extensions.push(keymap.of(yUndoManagerKeymap));

    // Type trigger handler (e.g., "- " for list, "[] " for checkbox)
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
                // Emit action - if handler returns true, consume the trigger text
                if (emit(Action.TypeTrigger(definition.id, trigger))) {
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

    // Type picker "#" detection - opens picker when "#" is typed
    extensions.push(
      EditorView.inputHandler.of((view, from, _to, text) => {
        if (text !== "#") return false;

        // Get cursor position for popup placement
        const coords = view.coordsAtPos(from);
        if (coords) {
          emit(
            Action.TypePickerOpen(
              { x: coords.left, y: coords.bottom + 4 },
              from,
            ),
          );
        }
        // Don't consume - let "#" be inserted
        return false;
      }),
    );

    // Filter out Mod-[ and Mod-] from defaultKeymap to let browser handle back/forward navigation
    const filteredDefaultKeymap = defaultKeymap.filter(
      (binding) => binding.key !== "Mod-[" && binding.key !== "Mod-]",
    );
    extensions.push(keymap.of(filteredDefaultKeymap));

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions,
    });

    // Determine if we're mounting without explicit selection (programmatic navigation).
    // Set awaitingSelectionFromModel BEFORE creating view, so updateListener won't
    // report selection changes caused by yCollab/CodeMirror during view initialization.
    const docHasContent = state.doc.length > 0;
    const hasExplicitSelection =
      initialStrategy.type !== "default" || !!props.selection;
    if (docHasContent && !hasExplicitSelection) {
      awaitingSelectionFromModel = true;
    }

    view = new EditorView({
      state,
      parent: containerRef,
    });

    console.debug("[TextEditor.mount] Initial selection state", {
      initialStrategy: initialStrategy.type,
      propsSelection: props.selection,
      docLength: view.state.doc.length,
      willDefault: !hasExplicitSelection,
      awaitingSelection: awaitingSelectionFromModel,
    });

    // Apply initial selection based on strategy type
    const docLen = view.state.doc.length;
    switch (initialStrategy.type) {
      case "range": {
        const anchor = Math.min(initialStrategy.anchor, docLen);
        const head = Math.min(initialStrategy.head, docLen);
        if (anchor === head) {
          view.dispatch({
            selection: EditorSelection.create([
              EditorSelection.cursor(anchor, initialStrategy.assoc),
            ]),
          });
        } else {
          view.dispatch({ selection: { anchor, head } });
        }
        break;
      }
      case "goalX": {
        if (docLen > 0) {
          const linePos = initialStrategy.goalLine === "first" ? 0 : docLen;
          const lineCoords = view.coordsAtPos(linePos);
          const contentRect = view.contentDOM.getBoundingClientRect();
          const targetY = lineCoords ? lineCoords.top + 1 : contentRect.top;
          const pos = view.posAtCoords({
            x: initialStrategy.goalX,
            y: targetY,
          });

          if (pos !== null) {
            // Detect wrap boundary and set assoc to stay on target visual line
            const coordsBefore = view.coordsAtPos(pos, -1);
            const coordsAfter = view.coordsAtPos(pos, 1);
            const isAtWrapBoundary =
              coordsBefore &&
              coordsAfter &&
              coordsBefore.top !== coordsAfter.top;
            // goalLine: "first" → assoc=-1 (stay on upper/first line), "last" → assoc=1 (stay on lower/last line)
            const assoc = isAtWrapBoundary
              ? initialStrategy.goalLine === "first"
                ? -1
                : 1
              : 0;

            suppressSelectionChange = true;
            view.dispatch({
              selection: EditorSelection.create([
                EditorSelection.cursor(pos, assoc),
              ]),
            });
            suppressSelectionChange = false;
          }
        }
        break;
      }
      case "click": {
        if (docLen > 0) {
          const result = view.posAndSideAtCoords({
            x: initialStrategy.x,
            y: initialStrategy.y,
          });
          if (result && result.pos !== null) {
            // Don't suppress - user clicks SHOULD save selection to buffer
            view.dispatch({
              selection: EditorSelection.create([
                EditorSelection.cursor(result.pos, result.assoc),
              ]),
            });
          }
        }
        break;
      }
      case "default": {
        if (docLen > 0) {
          // Only default to position 0 if doc has content
          // Otherwise, let updateListener set selection when Yjs syncs
          suppressSelectionChange = true;
          view.dispatch({ selection: { anchor: 0 } });
          suppressSelectionChange = false;
        }
        break;
      }
    }

    // Focus logic: balance cursor flash prevention with immediate focus for new blocks

    if (docLen > 0) {
      // Content already loaded - focus immediately
      setIsSelectionReady(true);
      // Suppress selection changes during focus to prevent yCollab cursor restoration
      suppressSelectionChange = true;
      view.focus();
      suppressSelectionChange = false;
    } else {
      // Doc is empty - check if we're expecting content from Yjs
      // If saved selection is beyond position 0, there must be content waiting to sync
      const expectingContent = props.selection && props.selection.anchor > 0;

      if (!expectingContent) {
        // New empty block or empty block at position 0 - focus immediately
        setIsSelectionReady(true);
        suppressSelectionChange = true;
        view.focus();
        suppressSelectionChange = false;
      }
      // else: wait for updateListener to focus after Yjs syncs
    }

    // Observe Y.Text changes to update formatting decorations
    // This handles format changes from Cmd+B, undo/redo, and remote collaboration
    // Note: Must defer dispatch to avoid "update during update" error from CodeMirror
    const formatObserver = (event: Y.YTextEvent) => {
      // Only rebuild decorations if formatting attributes changed.
      // Skip pure text insertions/deletions - the StateField maps positions through changes.
      const hasFormatChange = event.delta.some((d) => "attributes" in d);
      if (!hasFormatChange) {
        return; // Just text change, StateField handles position mapping
      }

      if (view) {
        const v = view;
        setTimeout(() => {
          v.dispatch({
            effects: rebuildFormattingEffect.of(ytext),
          });
        }, 0);
      }
    };
    ytext.observe(formatObserver);

    onCleanup(() => {
      ytext.unobserve(formatObserver);
      view?.destroy();
    });
  });

  // Sync selection from model to CodeMirror
  createEffect(() => {
    const selection = props.selection;

    console.debug("[TextEditor.selectionSync] Effect running", {
      hasView: !!view,
      selection,
      docLen: view?.state.doc.length,
      currentSel: view
        ? {
            anchor: view.state.selection.main.anchor,
            head: view.state.selection.main.head,
          }
        : null,
      awaitingSelection: awaitingSelectionFromModel,
    });

    // After mount, the first createEffect run gives reactivity a chance to propagate
    // the model selection. Clear the flag to allow future user selection changes.
    // If props.selection arrived, we'll sync it below. If not, user can now make changes.
    if (awaitingSelectionFromModel) {
      awaitingSelectionFromModel = false;
    }

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
          // Detect wrap boundary and set assoc to stay on target visual line
          const coordsBefore = view.coordsAtPos(pos, -1);
          const coordsAfter = view.coordsAtPos(pos, 1);
          const isAtWrapBoundary =
            coordsBefore && coordsAfter && coordsBefore.top !== coordsAfter.top;
          // goalLine: "first" → assoc=-1 (stay on upper/first line), "last" → assoc=1 (stay on lower/last line)
          const assoc = isAtWrapBoundary
            ? selection.goalLine === "first"
              ? -1
              : 1
            : 0;

          suppressSelectionChange = true;
          view.dispatch({
            selection: EditorSelection.create([
              EditorSelection.cursor(pos, assoc),
            ]),
          });
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

        console.debug("[TextEditor.selectionSync] Selection dispatched", {
          anchor,
          head,
          assoc: selection.assoc,
        });
      }
    }

    // Ensure focus when selection prop is set (e.g., after body click)
    // BUT: if doc is empty and selection > 0, we're waiting for Yjs to sync.
    // In that case, updateListener will handle focus after sync.
    const expectingContent = docLen === 0 && selection.anchor > 0;
    if (!view.hasFocus && !expectingContent) {
      suppressSelectionChange = true;
      view.focus();
      suppressSelectionChange = false;
    }
  });

  // Reconfigure type badges when types change
  createEffect(() => {
    if (!view) return;
    const types = props.inlineTypes;
    const nodeId = props.inlineTypesNodeId;
    // Trigger reactivity
    void types?.length;

    view.dispatch({
      effects: typeBadgeCompartment.reconfigure(
        types?.length && nodeId
          ? EditorView.decorations.compute(["doc"], (state) =>
              createTypeBadgeDecorations(state, types, nodeId),
            )
          : [],
      ),
    });
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
