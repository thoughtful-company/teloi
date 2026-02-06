import { Id, Model } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { FrameNotFoundError } from "../errors";

export function get(
  frameId: Id.Frame,
): Effect.Effect<Model.Frame, FrameNotFoundError, StoreT>;
export function get<K extends keyof Model.Frame>(
  frameId: Id.Frame,
  property: K,
): Effect.Effect<Model.Frame[K], FrameNotFoundError, StoreT>;

export function get(frameId: Id.Frame, property?: keyof Model.Frame) {
  return StoreT.pipe(
    Effect.flatMap((Store) => Store.getDocument("frame", frameId)),
    Effect.filterOrFail(
      (frame) => Option.isSome(frame),
      () => new FrameNotFoundError({ frameId }),
    ),
    Effect.map((frame) => Option.getOrThrow(frame)),
    Effect.map((frame) => (property ? frame[property] : frame)),
    Effect.tapBoth({
      onSuccess: (frame) =>
        Effect.logTrace("[Frame] Retrieved frame document.").pipe(
          Effect.annotateLogs("Frame Data", frame),
        ),
      onFailure: (err) =>
        Effect.logError("Failed to retrieve frame document.").pipe(
          Effect.annotateLogs("Error", err),
        ),
    }),
    Effect.annotateLogs({
      "Frame ID": frameId,
      Property: property ?? "full-frame",
    }),
  );
}
