import { Array as A, Option, pipe } from "effect";
import { getCaretRangeAtPoint } from "./caretUtils";
import type { Line, TextRect } from "./types";

type LeftOrRight = "right" | "left";
type CaretDrift = LeftOrRight | "exact";
type OffsetCandidate = {
  offset: number;
  x: number;
};

type ProbeContext = {
  range: Range;
  initialCandidate: OffsetCandidate;
  bias: CaretDrift;
  targetX: number;
};

/**
 * Calculates the closest text offset position in a line for any X coordinate.
 * Returns -1 if no valid offset could be found.
 */
export const getOffsetAtX = (line: Line, x: number): number =>
  pipe(
    calcOffsetClosestToX(line, x),
    Option.map((result) => buildProbeContext(result, x)),
    Option.map(selectBestOffset),
    Option.getOrElse(() => -1),
  );

// ————————————————————— Internal Functions —————————————————————

const buildProbeContext = (
  result: {
    range: Range;
    point: { x: number };
    bias: CaretDrift;
    textOffset: number;
  },
  targetX: number,
): ProbeContext => ({
  range: result.range,
  initialCandidate: {
    offset: result.range.endOffset + result.textOffset,
    x: result.point.x,
  },
  bias: result.bias,
  targetX,
});

const selectBestOffset = (ctx: ProbeContext): number =>
  ctx.bias === "exact"
    ? ctx.initialCandidate.offset
    : pipe(
        tryGetProbeCandidate(ctx),
        Option.map((probeCandidate) =>
          getClosestOffset(ctx.targetX, ctx.initialCandidate, probeCandidate),
        ),
        Option.getOrElse(() => ctx.initialCandidate.offset),
      );

const tryGetProbeCandidate = (
  ctx: ProbeContext,
): Option.Option<OffsetCandidate> => {
  const probeDirection = ctx.bias === "right" ? 1 : -1;
  const probeOffset = ctx.range.endOffset + probeDirection;

  if (!canProbeAtOffset(ctx.range.endContainer, probeOffset)) {
    return Option.none();
  }

  const probeRange = document.createRange();
  probeRange.setStart(ctx.range.endContainer, probeOffset);
  probeRange.collapse(true);

  const point = getRangeXY(probeRange);

  return Option.some({
    offset: ctx.initialCandidate.offset + probeDirection,
    x: point.x,
  });
};

const getClosestOffset = (
  x: number,
  candidate1: { offset: number; x: number },
  candidate2: { offset: number; x: number },
) => {
  const dist1 = Math.abs(x - candidate1.x);
  const dist2 = Math.abs(x - candidate2.x);
  return dist2 < dist1 ? candidate2.offset : candidate1.offset;
};

const canProbeAtOffset = (node: Node, offset: number): boolean => {
  return !!(
    node.textContent &&
    offset >= 0 &&
    offset <= node.textContent.length
  );
};

const calcOffsetClosestToX = (line: Line, x: number) =>
  pipe(
    getRangeAtContainingRect(line, x),
    Option.orElse(() => Option.some(getRangeAtClosestRect(line, x))),
  );

const getRangeAtClosestRect = (line: Line, x: number) => {
  const closestRect = getClosestRectToX(line, x);

  const range = getRangeForXAtRect(closestRect.rect, x, closestRect.side);
  if (!range) {
    throw new Error("Could not find a range at the closest rectangle edge.");
  }

  return createResult(range, closestRect.rect.textOffset, x);
};

const getClosestRectToX = (line: Line, x: number) =>
  line.rects.reduce(
    (acc, rect) => {
      const distanceToLeft = Math.abs(x - rect.left);
      const distanceToRight = Math.abs(x - rect.right);
      const minDistance = Math.min(distanceToLeft, distanceToRight);
      const caretFromSide: CaretDrift =
        distanceToLeft < distanceToRight ? "left" : "right";

      return minDistance < acc.distance
        ? { rect, distance: minDistance, side: caretFromSide }
        : acc;
    },
    {
      rect: line.rects[0],
      distance: Infinity,
      side: "right" as LeftOrRight,
    },
  );

const getRangeAtContainingRect = (line: Line, x: number) => {
  const maybeRect = pipe(
    line.rects.find((rect) => x >= rect.left && x <= rect.right),
    Option.fromNullable,
  );

  const maybeRange = Option.flatMap(maybeRect, (rectContainingX) =>
    pipe(getRangeForXAtRect(rectContainingX, x, "center"), Option.fromNullable),
  );

  return Option.zipWith(maybeRange, maybeRect, (range, rectContainingX) =>
    createResult(range, rectContainingX.textOffset, x),
  );
};

const getRangeForXAtRect = (
  rect: TextRect,
  x: number,
  relativePos: "left" | "right" | "center",
) => {
  const y = (rect.top + rect.bottom) / 2;
  const xPos =
    relativePos === "center"
      ? x
      : relativePos === "left"
        ? rect.left
        : rect.right;
  return getCaretRangeAtPoint(xPos, y);
};

const determineBias = (pointX: number, targetX: number): CaretDrift =>
  pointX === targetX ? "exact" : pointX > targetX ? "left" : "right";

const createResult = (range: Range, textOffset: number, x: number) => {
  const point = getRangeXY(range);
  const bias = determineBias(point.x, x);
  return {
    range,
    point,
    bias,
    textOffset,
  };
};

function getRangeXY(range: Range) {
  const rects = A.fromIterable(range.getClientRects());
  const rect = A.isNonEmptyArray(rects)
    ? rects[0]
    : range.getBoundingClientRect();

  return {
    x: (rect.right + rect.left) / 2,
    y: (rect.bottom + rect.top) / 2,
  };
}
