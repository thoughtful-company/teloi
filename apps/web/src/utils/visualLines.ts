import { Effect, pipe } from "effect";

export interface TextRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  textNode: Text;
  textOffset: number;
}

export interface Line {
  lineNumber: number;
  rects: [TextRect, ...TextRect[]];
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Parses a non-empty HTMLElement into visual lines based on
 * how much visual space is occupied by its text nodes.
 */
export const getVisualLines = (element: HTMLElement) =>
  pipe(splitIntoRectsByTextNode(element), Effect.map(groupRectsByLines));

function groupRectsByLines(textRects: TextRect[]) {
  const lines: Line[] = [];
  const getLineNumber = () => lines.length + 1;

  for (const rect of textRects) {
    if (lines.length === 0) {
      lines.push({
        lineNumber: 1,
        rects: [rect],
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      });
      continue;
    }

    const EPS_Y = 1;

    const lastLine = lines.at(-1)!;
    const overlapY = calcOverlapY(lastLine, rect);
    const minHeight = Math.min(getHeight(rect), getHeight(lastLine));
    const reqHeight = Math.max(EPS_Y, minHeight / 2);

    if (overlapY >= reqHeight) {
      addRectToLine(rect, lastLine);
      continue;
    }

    lines.push({
      lineNumber: getLineNumber(),
      rects: [rect],
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      top: rect.top,
    });
  }

  return lines;
}

function addRectToLine(rect: TextRect, line: Line) {
  line.rects.push(rect);
  line.left = Math.min(line.left, rect.left);
  line.right = Math.max(line.right, rect.right);
  line.top = Math.min(line.top, rect.top);
  line.bottom = Math.max(line.bottom, rect.bottom);
}

function getHeight(x: TextRect | Line) {
  return x.bottom - x.top;
}

function calcOverlapY(a: TextRect | Line, b: TextRect | Line) {
  return Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

const splitIntoRectsByTextNode = (element: HTMLElement) =>
  Effect.sync((): TextRect[] => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const rects: TextRect[] = [];

    let textOffset = 0;

    while (walker.nextNode()) {
      const currNode = walker.currentNode as Text;
      range.selectNodeContents(currNode);

      const currRects = Array.from(range.getClientRects()).map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        textNode: currNode,
        textOffset,
      }));

      textOffset += currNode.textContent?.length ?? 0;

      rects.push(...currRects);
    }

    return rects;
  });

/**
 * Finds which visual line contains the given Y coordinate.
 * Returns the line number (1-indexed) or null if not found.
 */
export const findLineAtY = (lines: Line[], y: number): number | null => {
  for (const line of lines) {
    if (y >= line.top && y <= line.bottom) {
      return line.lineNumber;
    }
  }
  return null;
};

/**
 * Checks if the given Y coordinate is on the first visual line.
 */
export const isOnFirstVisualLine = (element: HTMLElement, cursorY: number) =>
  pipe(
    getVisualLines(element),
    Effect.map((lines) => {
      if (lines.length === 0) return true;
      const lineNum = findLineAtY(lines, cursorY);
      return lineNum === 1 || lineNum === null;
    }),
  );

/**
 * Checks if the given Y coordinate is on the last visual line.
 */
export const isOnLastVisualLine = (element: HTMLElement, cursorY: number) =>
  pipe(
    getVisualLines(element),
    Effect.map((lines) => {
      if (lines.length === 0) return true;
      const lineNum = findLineAtY(lines, cursorY);
      return lineNum === lines.length || lineNum === null;
    }),
  );
