import { Id } from "@/schema";
import { Data } from "effect";

export class KhoraNotFoundError extends Data.TaggedError("KhoraNotFoundError")<{
  khoraId: Id.Khora;
}> {}

export class KhoraGoneError extends Data.TaggedError("KhoraGoneError")<{
  khoraId: Id.Khora;
  nodeId: Id.Node;
}> {}

/**
 * Error thrown when trying to subscribe to a virtual block.
 * Virtual blocks (those with tupleId = __virtual__) are placeholders
 * and shouldn't be subscribed to - they have their own VirtualBlock component.
 */
export class VirtualBlockError extends Data.TaggedError("VirtualBlockError")<{
  khoraId: Id.Khora;
}> {}
