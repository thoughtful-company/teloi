import { Id } from "@/schema";
import { Data } from "effect";

export class FrameNotFoundError extends Data.TaggedError("FrameNotFoundError")<{
  frameId: Id.Frame;
}> {}

export class FrameNodeNotAssignedError extends Data.TaggedError(
  "FrameNodeNotAssignedError",
)<{
  frameId: Id.Frame;
}> {}
