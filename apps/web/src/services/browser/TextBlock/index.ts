import { Context, Effect, Either, Layer, Option } from "effect";
import { getLineAtY, YOutOfBoundError } from "./getLineAtY";
import { getOffsetAtX } from "./getOffsetAtX";
import { getVisualLines } from "./getVisualLines";
import type { Line } from "./types";

export { YOutOfBoundError } from "./getLineAtY";
export { posAtCoordsInElement } from "./posAtCoordsInElement";
export type { Line, TextRect } from "./types";

export class TextBlockB extends Context.Tag("TextBlockB")<
  TextBlockB,
  {
    /**
     * Parses an HTMLElement into lines by splitting it into rects
     * and grouping those rects into visual lines.
     */
    getVisualLines: (element: HTMLElement) => Effect.Effect<Line[]>;

    /**
     * Finds the visual line at the given Y coordinate.
     */
    getLineAtY: (
      lines: Line[],
      y: number,
    ) => Either.Either<Line, YOutOfBoundError>;

    /**
     * Gets a line by its 1-indexed line number.
     */
    getLineByNumber: (lines: Line[], lineNumber: number) => Option.Option<Line>;

    /**
     * Calculates the closest text offset position in a line for any X coordinate.
     */
    getOffsetAtX: (line: Line, x: number) => number;
  }
>() {}

const getLineByNumber = (lines: Line[], lineNumber: number) =>
  Option.fromNullable(lines.find((line) => line.lineNumber === lineNumber));

export const TextBlockLive = Layer.succeed(TextBlockB, {
  getVisualLines,
  getLineAtY,
  getOffsetAtX,
  getLineByNumber,
});
