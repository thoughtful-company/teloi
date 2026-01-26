/**
 * Resolves click coordinates to a text position within an HTML element.
 *
 * Uses DOM APIs (document.caretRangeFromPoint / caretPositionFromPoint)
 * to determine which character was clicked and whether the click was
 * closer to the left or right side of that character.
 */

import { getCaretInfoAtPoint } from "./caretUtils";

/**
 * Resolve click coordinates to text offset and cursor association.
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
  const caretInfo = getCaretInfoAtPoint(x, y);
  if (!caretInfo) return null;

  const { node, offsetInNode } = caretInfo;

  if (!element.contains(node)) return null;

  const cumulativeOffset = getCumulativeOffset(element, node, offsetInNode);
  const assoc = calculateAssoc(node, offsetInNode, x, y);

  return { offset: cumulativeOffset, assoc };
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
      return offset + offsetInNode;
    }
    offset += (node as Text).length;
  }

  // Target node not found - edge case fallback
  if (targetNode.nodeType === Node.TEXT_NODE) {
    return offsetInNode;
  }

  return 0;
}

/**
 * Calculate cursor association at the given position.
 *
 * At wrap boundaries, the same text offset can appear at two visual positions:
 * - End of line N (assoc=-1: associate with char before)
 * - Start of line N+1 (assoc=1: associate with char after)
 *
 * We use Y coordinate to determine which visual line was clicked, then set
 * assoc to keep the cursor on that line.
 */
function calculateAssoc(
  node: Node,
  offsetInNode: number,
  clickX: number,
  clickY: number,
): -1 | 1 {
  if (node.nodeType !== Node.TEXT_NODE) return 1;

  const textNode = node as Text;
  const textLength = textNode.length;

  if (textLength === 0) return 1;

  try {
    const range = document.createRange();

    // Get rects for chars before and after the offset to detect wrap boundaries
    let beforeRect: DOMRect | null = null;
    let afterRect: DOMRect | null = null;

    if (offsetInNode > 0) {
      range.setStart(textNode, offsetInNode - 1);
      range.setEnd(textNode, offsetInNode);
      beforeRect = range.getClientRects()[0] ?? null;
    }

    if (offsetInNode < textLength) {
      range.setStart(textNode, offsetInNode);
      range.setEnd(textNode, offsetInNode + 1);
      afterRect = range.getClientRects()[0] ?? null;
    }

    // Check if this is a wrap boundary (chars before/after are on different lines)
    const isWrapBoundary =
      beforeRect && afterRect && beforeRect.bottom <= afterRect.top;

    if (isWrapBoundary) {
      // At wrap boundary: use Y to determine which line was clicked
      const upperLineBottom = beforeRect!.bottom;
      return clickY < upperLineBottom ? -1 : 1;
    }

    // Not a wrap boundary: use X position relative to character midpoint
    if (afterRect) {
      if (clickX >= afterRect.left && clickX <= afterRect.right) {
        const midpoint = afterRect.left + afterRect.width / 2;
        return clickX < midpoint ? -1 : 1;
      }
    }

    if (beforeRect) {
      if (clickX >= beforeRect.left && clickX <= beforeRect.right) {
        const midpoint = beforeRect.left + beforeRect.width / 2;
        return clickX < midpoint ? -1 : 1;
      }
    }

    // Fallback based on position
    if (offsetInNode === 0) return 1;
    if (offsetInNode >= textLength) return -1;
  } catch {
    // Range operations can throw in edge cases
  }

  return 1;
}
