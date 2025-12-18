import { Id } from "@/schema";
import { Data } from "effect";

export class BufferNotFoundError extends Data.TaggedError(
  "BufferNotFoundError",
)<{
  bufferId: Id.Buffer;
}> {}

export class BufferNodeNotAssignedError extends Data.TaggedError(
  "BufferNodeNotAssignedError",
)<{
  bufferId: Id.Buffer;
}> {}
