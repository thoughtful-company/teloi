/**
 * Utility to extract CursorContext from CodeMirror EditorView.
 * Used by components to build AppAction with full cursor context.
 */

import type { EditorView } from "@codemirror/view";
import type { CursorContext } from "@/services/ui/Action/types";

/**
 * Extract full cursor context from a CodeMirror EditorView.
 * This provides all the information ActionT needs to interpret a key event.
 */
export function getCursorContext(view: EditorView): CursorContext {
  const state = view.state;
  const sel = state.selection.main;
  const doc = state.doc;
  const docLen = doc.length;
  const docText = doc.toString();

  // Position info
  const position = sel.head;
  const anchor = sel.anchor;
  const head = sel.head;
  const atStart = anchor === 0 && head === 0;
  const atEnd = anchor === docLen && head === docLen;

  // Text before/after cursor
  const textBefore = docText.slice(0, position);
  const textAfter = docText.slice(position);

  // Line info - check if on first/last visual line using Y coordinates
  const lineInfo = getLineInfo(view, sel.head, sel.assoc);

  // Cursor coordinates for picker positioning
  const coords = view.coordsAtPos(position);

  // Trust CodeMirror's assoc value - it knows whether we're at a wrap boundary
  const assoc = sel.assoc as -1 | 0 | 1;

  return {
    position,
    anchor,
    head,
    atStart,
    atEnd,
    textBefore,
    textAfter,
    docText,
    lineInfo,
    coords: coords ? { x: coords.left, y: coords.top } : null,
    goalX: coords?.left ?? null,
    assoc,
  };
}

/**
 * Get line information including whether cursor is on first/last visual line.
 */
function getLineInfo(
  view: EditorView,
  head: number,
  assoc: number,
): CursorContext["lineInfo"] {
  const state = view.state;
  const doc = state.doc;

  // Get logical line info
  const line = doc.lineAt(head);
  const lineNumber = line.number - 1; // 0-indexed
  const totalLines = doc.lines;
  const column = head - line.from;

  // Check if on first/last VISUAL line using moveVertically
  // This accounts for line wrapping
  const sel = state.selection.main;

  // Convert assoc to coordsAtPos side: -1 = end of prev line, 1 = start of next line
  const assocToSide = (a: number): -1 | 1 => (a === 1 ? 1 : -1);

  const currentY = view.coordsAtPos(head, assocToSide(assoc))?.top;

  // Try moving up - if Y doesn't change, we're on first visual line
  const movedUp = view.moveVertically(sel, false);
  const movedUpY = view.coordsAtPos(
    movedUp.head,
    assocToSide(movedUp.assoc),
  )?.top;
  const atFirstLine = currentY === movedUpY;

  // Try moving down - if Y doesn't change, we're on last visual line
  const movedDown = view.moveVertically(sel, true);
  const movedDownY = view.coordsAtPos(
    movedDown.head,
    assocToSide(movedDown.assoc),
  )?.top;
  const atLastLine = currentY === movedDownY;

  return {
    line: lineNumber,
    totalLines,
    atFirstLine,
    atLastLine,
    column,
  };
}
