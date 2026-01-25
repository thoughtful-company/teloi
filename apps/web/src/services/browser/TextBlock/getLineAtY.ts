import { Data, Either } from "effect";
import type { Line } from "./types";

export class YOutOfBoundError extends Data.TaggedError("YOutOfBoundError")<{
  lines: Line[];
  y: number;
}> {}

export const getLineAtY = (lines: Line[], y: number) =>
  Either.fromNullable(
    lines.find((line) => line.top <= y && line.bottom >= y),
    () => new YOutOfBoundError({ lines, y }),
  );
