import { Id, Model } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";

export function get(
  bufferId: Id.Buffer,
): Effect.Effect<Model.EditorBuffer, BufferNotFoundError, StoreT>;
export function get<K extends keyof Model.EditorBuffer>(
  bufferId: Id.Buffer,
  property: K,
): Effect.Effect<Model.EditorBuffer[K], BufferNotFoundError, StoreT>;
/**
 * Retrieve a buffer document from the store or a single property of that buffer.
 *
 * @param bufferId - The identifier of the buffer document to retrieve
 * @param property - Optional key of the buffer to return; if omitted the full buffer is returned
 * @returns The buffer document when `property` is omitted, or the value of the specified `property` when provided. The effect fails with `BufferNotFoundError` if no buffer exists for `bufferId`.
 */
export function get(bufferId: Id.Buffer, property?: keyof Model.EditorBuffer) {
  return StoreT.pipe(
    Effect.flatMap((Store) => Store.getDocument("buffer", bufferId)),
    Effect.filterOrFail(
      (buffer) => Option.isSome(buffer),
      () => new BufferNotFoundError({ bufferId }),
    ),
    Effect.map((buffer) => Option.getOrThrow(buffer)),
    Effect.map((buffer) => (property ? buffer[property] : buffer)),
    Effect.tapBoth({
      onSuccess: (buffer) =>
        Effect.logTrace("[Buffer] Retrieved buffer document.").pipe(
          Effect.annotateLogs("Buffer Data", buffer),
        ),
      onFailure: (err) =>
        Effect.logError("Failed to retrieve buffer document.").pipe(
          Effect.annotateLogs("Error", err),
        ),
    }),
    Effect.annotateLogs({
      "Buffer ID": bufferId,
      Property: property ?? "full-buffer",
    }),
  );
}