import { Id } from "@/schema";
import { Data } from "effect";

export class NodeError extends Data.TaggedError("NodeError")<{
  nodeId: Id.Node;
}> {}

export class NodeInsertError extends Data.TaggedError("NodeInsertError")<{
  nodeId: Id.Node;
}> {}

export class NodeNotFoundError extends Data.TaggedError("NodeNotFoundError")<{
  nodeId: Id.Node;
}> {}

export class NodeHasNoParentError extends Data.TaggedError(
  "NodeHasNoParentError",
)<{
  nodeId: Id.Node;
}> {}
