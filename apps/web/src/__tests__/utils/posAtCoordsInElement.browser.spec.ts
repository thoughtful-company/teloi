/**
 * Tests for posAtCoordsInElement utility.
 *
 * This utility resolves click coordinates to a text position within an HTML element
 * using DOM APIs (document.caretRangeFromPoint) rather than CodeMirror.
 *
 * These tests run in browser mode since they require real DOM layout and
 * caret position APIs that don't exist in jsdom.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { posAtCoordsInElement } from "@/services/browser/TextBlock";

describe("posAtCoordsInElement", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Create a container with predictable styling for consistent layout
    container = document.createElement("div");
    container.style.cssText = `
      position: absolute;
      top: 100px;
      left: 100px;
      font-family: monospace;
      font-size: 16px;
      line-height: 20px;
      padding: 0;
      margin: 0;
      white-space: pre;
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  /**
   * Helper to get element's bounding rect for coordinate calculations.
   */
  function getRect(): DOMRect {
    return container.getBoundingClientRect();
  }

  describe("basic text position resolution", () => {
    it("returns offset 0 when clicking at the start of text", () => {
      container.textContent = "hello world";
      const rect = getRect();

      // Click at the very beginning of the element
      const result = posAtCoordsInElement(
        container,
        rect.left + 1,
        rect.top + 10,
      );

      expect(result).not.toBeNull();
      expect(result!.offset).toBe(0);
    });

    it("returns offset equal to text length when clicking at the end", () => {
      container.textContent = "hello";
      const rect = getRect();

      // Click at the far right of the text
      const result = posAtCoordsInElement(
        container,
        rect.right - 1,
        rect.top + 10,
      );

      expect(result).not.toBeNull();
      expect(result!.offset).toBe(5); // "hello".length
    });

    it("returns correct offset when clicking in the middle of text", () => {
      container.textContent = "abcdefghij";
      const rect = getRect();

      // Get approximate character width (monospace font makes this predictable)
      const charWidth = rect.width / 10;

      // Click roughly in the middle (around position 5)
      const clickX = rect.left + charWidth * 5;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      // Should be around position 5, allowing for some variance in font metrics
      expect(result!.offset).toBeGreaterThanOrEqual(4);
      expect(result!.offset).toBeLessThanOrEqual(6);
    });

    it("handles single character text", () => {
      container.textContent = "X";
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left + rect.width / 2,
        rect.top + 10,
      );

      expect(result).not.toBeNull();
      expect(result!.offset).toBeGreaterThanOrEqual(0);
      expect(result!.offset).toBeLessThanOrEqual(1);
    });
  });

  describe("association (assoc) calculation", () => {
    it("returns assoc -1 when clicking left of character center", () => {
      container.textContent = "XXXX";
      const rect = getRect();
      const charWidth = rect.width / 4;

      // Click on the left side of the second character
      const clickX = rect.left + charWidth + 1; // Just past first char boundary
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      // When clicking left of center, assoc should be -1 (cursor goes before char)
      // The exact offset depends on where we click, but assoc logic should be testable
      expect(result!.assoc).toBe(-1);
    });

    it("returns assoc 1 when clicking right of character center", () => {
      container.textContent = "XXXX";
      const rect = getRect();
      const charWidth = rect.width / 4;

      // Click on the right side of the second character (closer to third char)
      const clickX = rect.left + charWidth * 2 - 1; // Just before second char boundary
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      // When clicking right of center, assoc should be 1 (cursor goes after char)
      expect(result!.assoc).toBe(1);
    });
  });

  describe("formatted text with spans", () => {
    it("calculates correct cumulative offset across span elements", () => {
      // Simulate formatted text: "hello <b>bold</b> world"
      container.innerHTML = "hello <span>bold</span> world";
      const rect = getRect();

      // Click somewhere in the "world" part
      // "hello bold " = 11 chars, then "world"
      // Total text content: "hello bold world" = 16 chars
      const fullText = container.textContent!;
      expect(fullText).toBe("hello bold world");

      const charWidth = rect.width / fullText.length;

      // Click in the "world" section (around position 12)
      const clickX = rect.left + charWidth * 13;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      // Should return offset relative to the entire text content
      expect(result!.offset).toBeGreaterThanOrEqual(11);
      expect(result!.offset).toBeLessThanOrEqual(16);
    });

    it("handles nested formatting spans", () => {
      // Nested formatting: "a<b>b<i>c</i>d</b>e"
      container.innerHTML = "a<span><span>bc</span>d</span>e";
      const rect = getRect();

      const fullText = container.textContent!;
      expect(fullText).toBe("abcde");

      const charWidth = rect.width / fullText.length;

      // Click on 'd' (position 3)
      const clickX = rect.left + charWidth * 3.5;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      expect(result!.offset).toBeGreaterThanOrEqual(3);
      expect(result!.offset).toBeLessThanOrEqual(4);
    });

    it("handles multiple adjacent spans", () => {
      container.innerHTML = "<span>aaa</span><span>bbb</span><span>ccc</span>";
      const rect = getRect();

      const fullText = container.textContent!;
      expect(fullText).toBe("aaabbbccc");

      const charWidth = rect.width / fullText.length;

      // Click in middle of second span (around position 4-5)
      const clickX = rect.left + charWidth * 4.5;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      expect(result!.offset).toBeGreaterThanOrEqual(4);
      expect(result!.offset).toBeLessThanOrEqual(5);
    });
  });

  describe("empty and special content", () => {
    it("handles element with non-breaking space", () => {
      container.innerHTML = "\u00A0"; // Non-breaking space
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left + rect.width / 2,
        rect.top + 10,
      );

      // Should handle gracefully - either return valid position or null
      // Implementation may treat NBSP as a character
      if (result !== null) {
        expect(result.offset).toBeGreaterThanOrEqual(0);
        expect(result.offset).toBeLessThanOrEqual(1);
      }
    });

    it("handles element with only whitespace", () => {
      container.textContent = "   "; // Three spaces
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left + rect.width / 2,
        rect.top + 10,
      );

      // Whitespace-only content should still be navigable
      if (result !== null) {
        expect(result.offset).toBeGreaterThanOrEqual(0);
        expect(result.offset).toBeLessThanOrEqual(3);
      }
    });

    it("handles empty element gracefully", () => {
      container.textContent = "";
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left + 1,
        rect.top + 10,
      );

      // Empty element should return offset 0 or null
      if (result !== null) {
        expect(result.offset).toBe(0);
      }
    });
  });

  describe("click outside element bounds", () => {
    it("returns null when clicking above the element", () => {
      container.textContent = "hello";
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left + 10,
        rect.top - 50, // Well above the element
      );

      expect(result).toBeNull();
    });

    it("returns null when clicking below the element", () => {
      container.textContent = "hello";
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left + 10,
        rect.bottom + 50, // Well below the element
      );

      expect(result).toBeNull();
    });

    it("returns null when clicking to the left of the element", () => {
      container.textContent = "hello";
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.left - 50, // Well to the left
        rect.top + 10,
      );

      expect(result).toBeNull();
    });

    it("returns null when clicking to the right of the element", () => {
      container.textContent = "hello";
      const rect = getRect();

      const result = posAtCoordsInElement(
        container,
        rect.right + 50, // Well to the right
        rect.top + 10,
      );

      expect(result).toBeNull();
    });

    it("returns null when clicking on a completely different element", () => {
      container.textContent = "hello";

      // Create another element elsewhere
      const other = document.createElement("div");
      other.style.cssText = `
        position: absolute;
        top: 500px;
        left: 500px;
        width: 100px;
        height: 100px;
      `;
      other.textContent = "other";
      document.body.appendChild(other);

      const otherRect = other.getBoundingClientRect();

      try {
        const result = posAtCoordsInElement(
          container, // Still targeting original container
          otherRect.left + 10,
          otherRect.top + 10,
        );

        // Click is on 'other' element, not container - should return null
        expect(result).toBeNull();
      } finally {
        other.remove();
      }
    });
  });

  describe("edge cases", () => {
    it("handles text with inline elements that have zero width", () => {
      // Empty span shouldn't affect offset calculation
      container.innerHTML = "ab<span></span>cd";
      const rect = getRect();

      const fullText = container.textContent!;
      expect(fullText).toBe("abcd");

      const charWidth = rect.width / fullText.length;

      // Click on 'c' (position 2)
      const clickX = rect.left + charWidth * 2.5;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      expect(result!.offset).toBeGreaterThanOrEqual(2);
      expect(result!.offset).toBeLessThanOrEqual(3);
    });

    it("handles moderately long text", () => {
      // Use a reasonable length that stays within viewport
      // (very long text with white-space:pre would overflow viewport and
      // caretRangeFromPoint returns null for off-screen coordinates)
      const longText = "x".repeat(50);
      container.textContent = longText;
      const rect = getRect();

      // Click somewhere in the middle
      const clickX = rect.left + rect.width / 2;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      // Should be around position 25
      expect(result!.offset).toBeGreaterThanOrEqual(20);
      expect(result!.offset).toBeLessThanOrEqual(30);
    });

    it("handles multiline text (wrapped or with br)", () => {
      container.style.whiteSpace = "normal";
      container.style.width = "100px";
      container.innerHTML = "line one<br>line two";

      const rect = getRect();

      // Click on second line
      const result = posAtCoordsInElement(
        container,
        rect.left + 20,
        rect.top + 30, // Second line
      );

      // Should return a valid position in the second line
      if (result !== null) {
        expect(result.offset).toBeGreaterThanOrEqual(8); // After "line one"
      }
    });

    it("handles text nodes mixed with comment nodes", () => {
      // Comments shouldn't affect offset calculation
      container.innerHTML = "abc<!-- comment -->def";
      const rect = getRect();

      const fullText = container.textContent!;
      expect(fullText).toBe("abcdef");

      const charWidth = rect.width / fullText.length;

      // Click on 'd' (position 3)
      const clickX = rect.left + charWidth * 3.5;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      expect(result!.offset).toBeGreaterThanOrEqual(3);
      expect(result!.offset).toBeLessThanOrEqual(4);
    });
  });

  describe("TreeWalker text node traversal", () => {
    it("correctly accumulates offset across multiple text nodes", () => {
      // Create multiple adjacent text nodes (unusual but possible)
      container.innerHTML = "";
      container.appendChild(document.createTextNode("aaa"));
      container.appendChild(document.createTextNode("bbb"));
      container.appendChild(document.createTextNode("ccc"));

      const rect = getRect();
      const fullText = container.textContent!;
      expect(fullText).toBe("aaabbbccc");

      const charWidth = rect.width / fullText.length;

      // Click in the middle text node (around position 4-5)
      const clickX = rect.left + charWidth * 4.5;
      const result = posAtCoordsInElement(container, clickX, rect.top + 10);

      expect(result).not.toBeNull();
      // Offset should be cumulative across all text nodes
      expect(result!.offset).toBeGreaterThanOrEqual(4);
      expect(result!.offset).toBeLessThanOrEqual(5);
    });
  });
});
