import { Id } from "@/schema";
import { Data } from "effect";

export class BlockNotFoundError extends Data.TaggedError("BlockNotFoundError")<{
  blockId: Id.Block;
}> {}

export class BlockGoneError extends Data.TaggedError("BlockGoneError")<{
  blockId: Id.Block;
  nodeId: Id.Node;
}> {}
