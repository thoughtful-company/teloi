/**
 * Cross-browser utilities for caret/cursor position detection using DOM APIs.
 * Chrome/Safari use caretRangeFromPoint, Firefox uses caretPositionFromPoint.
 */

export interface CaretInfo {
  node: Node;
  offsetInNode: number;
}

/**
 * Get caret position at screen coordinates.
 * Returns the DOM node and offset within that node.
 */
export function getCaretInfoAtPoint(x: number, y: number): CaretInfo | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  // Firefox: caretPositionFromPoint
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    return { node: pos.offsetNode, offsetInNode: pos.offset };
  }

  // Chrome/Safari: caretRangeFromPoint
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    if (!range) return null;
    return { node: range.startContainer, offsetInNode: range.startOffset };
  }

  return null;
}

/**
 * Get a Range positioned at the caret position for the given coordinates.
 * Useful when you need a Range object for further DOM operations.
 */
export function getCaretRangeAtPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }

  if (doc.caretRangeFromPoint) {
    return doc.caretRangeFromPoint(x, y) ?? null;
  }

  return null;
}
