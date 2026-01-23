/**
 * Resolves click coordinates to a text position within an HTML element.
 *
 * Uses DOM APIs (document.caretRangeFromPoint / caretPositionFromPoint)
 * to determine which character was clicked and whether the click was
 * closer to the left or right side of that character.
 *
 * @param element - The container element to resolve position within
 * @param x - Client X coordinate of the click
 * @param y - Client Y coordinate of the click
 * @returns Position info with offset and association, or null if outside element
 */
export function posAtCoordsInElement(
  element: HTMLElement,
  x: number,
  y: number,
): { offset: number; assoc: -1 | 1 } | null {
  // Get caret position at coordinates using DOM API
  const caretInfo = getCaretInfoAtPoint(x, y);
  if (!caretInfo) return null;

  const { node, offsetInNode } = caretInfo;

  // Verify the node is inside our element
  if (!element.contains(node)) return null;

  // Calculate cumulative text offset using TreeWalker
  const cumulativeOffset = getCumulativeOffset(element, node, offsetInNode);

  // Calculate assoc by comparing click X to character midpoint
  const assoc = calculateAssoc(node, offsetInNode, x);

  return { offset: cumulativeOffset, assoc };
}

interface CaretInfo {
  node: Node;
  offsetInNode: number;
}

/**
 * Cross-browser caret position from point.
 * Chrome/Safari use caretRangeFromPoint, Firefox uses caretPositionFromPoint.
 */
function getCaretInfoAtPoint(x: number, y: number): CaretInfo | null {
  // Type-safe access to browser-specific APIs
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
 * Calculate cumulative text offset from element start to the given position.
 * Uses TreeWalker to traverse all text nodes and sum their lengths.
 */
function getCumulativeOffset(
  element: HTMLElement,
  targetNode: Node,
  offsetInNode: number,
): number {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  let offset = 0;
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (node === targetNode) {
      // Found the target node - add the offset within this node
      return offset + offsetInNode;
    }
    // Add this node's full length
    offset += (node as Text).length;
  }

  // Target node not found in tree - might be at position 0 in first node
  // or we're in an edge case where the node isn't a text node
  if (targetNode.nodeType === Node.TEXT_NODE) {
    return offsetInNode;
  }

  return 0;
}

/**
 * Calculate cursor association based on click position relative to character center.
 * Returns -1 if click is left of the character's center, 1 if right.
 *
 * The caretRangeFromPoint returns an insertion point (offset). We need to determine
 * which character the user actually clicked on and whether they clicked on its left
 * or right half.
 */
function calculateAssoc(
  node: Node,
  offsetInNode: number,
  clickX: number,
): -1 | 1 {
  if (node.nodeType !== Node.TEXT_NODE) return 1;

  const textNode = node as Text;
  const textLength = textNode.length;

  // Empty text
  if (textLength === 0) return 1;

  try {
    const range = document.createRange();

    // The browser's offset is the insertion point. We need to determine which
    // visible character the click was on. Check both the char before and after
    // the offset (if they exist) and see which one the click falls within.

    // Try char AT the offset first (char on the right of insertion point)
    if (offsetInNode < textLength) {
      range.setStart(textNode, offsetInNode);
      range.setEnd(textNode, offsetInNode + 1);
      const rightCharRects = range.getClientRects();
      const charRect = rightCharRects[0];

      if (charRect) {
        // Check if click falls within this character
        if (clickX >= charRect.left && clickX <= charRect.right) {
          const charMidpoint = charRect.left + charRect.width / 2;
          return clickX < charMidpoint ? -1 : 1;
        }
      }
    }

    // Try char BEFORE the offset (char on the left of insertion point)
    if (offsetInNode > 0) {
      range.setStart(textNode, offsetInNode - 1);
      range.setEnd(textNode, offsetInNode);
      const leftCharRects = range.getClientRects();
      const charRect = leftCharRects[0];

      if (charRect) {
        // Check if click falls within this character
        if (clickX >= charRect.left && clickX <= charRect.right) {
          const charMidpoint = charRect.left + charRect.width / 2;
          return clickX < charMidpoint ? -1 : 1;
        }
      }
    }

    // If we couldn't determine from character bounds, use the offset itself
    // At start → associate right (1), at end → associate left (-1)
    if (offsetInNode === 0) return 1;
    if (offsetInNode >= textLength) return -1;
  } catch {
    // Range operations can throw in edge cases
  }

  // Default: middle of text, default to right association
  return 1;
}
