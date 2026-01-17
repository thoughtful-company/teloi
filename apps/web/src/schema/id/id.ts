import { Data, Effect, Schema } from "effect";

// Base schema that only allows nanoid-safe characters (A-Za-z0-9_-)
const SafeIdString = Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]+$/));

export const Window = SafeIdString.pipe(Schema.brand("WindowId"));
export const Pane = SafeIdString.pipe(Schema.brand("PaneId"));
export const Buffer = SafeIdString.pipe(Schema.brand("BufferId"));
export const Node = SafeIdString.pipe(Schema.brand("NodeId"));
export const Tuple = SafeIdString.pipe(Schema.brand("TupleId"));

// Block is a composite ID containing : delimiter
export const Block = Schema.String.pipe(Schema.brand("BlockId"));

export type Window = typeof Window.Type;
export type Pane = typeof Pane.Type;
export type Buffer = typeof Buffer.Type;
export type Block = typeof Block.Type;
export type Node = typeof Node.Type;
export type Tuple = typeof Tuple.Type;

const BLOCK_ID_SEPARATOR = ":";

export const makeBlockId = (bufferId: Buffer, nodeId: Node): Block =>
  Block.make(`${bufferId}${BLOCK_ID_SEPARATOR}${nodeId}`);

export class InvalidBlockIdError extends Data.TaggedError(
  "InvalidBlockIdError",
)<{
  blockId: string;
}> {}

export const parseBlockId = (
  blockId: Block,
): Effect.Effect<[Buffer, Node], InvalidBlockIdError> => {
  const separatorIndex = blockId.indexOf(BLOCK_ID_SEPARATOR);
  if (separatorIndex === -1) {
    return Effect.fail(new InvalidBlockIdError({ blockId }));
  }
  const bufferId = blockId.slice(0, separatorIndex);
  const nodeId = blockId.slice(separatorIndex + 1);
  return Effect.succeed([Buffer.make(bufferId), Node.make(nodeId)]);
};
