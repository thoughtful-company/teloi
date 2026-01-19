import { Id } from "@/schema";
import { Data } from "effect";

export class BlockNotFoundError extends Data.TaggedError("BlockNotFoundError")<{
  blockId: Id.Block;
}> {}

export class BlockGoneError extends Data.TaggedError("BlockGoneError")<{
  blockId: Id.Block;
  nodeId: Id.Node;
}> {}

/**
 * Error thrown when trying to subscribe to a virtual block.
 * Virtual blocks (those with tupleId = __virtual__) are placeholders
 * and shouldn't be subscribed to - they have their own VirtualBlock component.
 */
export class VirtualBlockError extends Data.TaggedError("VirtualBlockError")<{
  blockId: Id.Block;
}> {}
