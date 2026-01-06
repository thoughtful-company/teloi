import { Data, Effect, Schema } from "effect";

export const Window = Schema.String.pipe(Schema.brand("WindowId"));
export const Pane = Schema.String.pipe(Schema.brand("PaneId"));
export const Buffer = Schema.String.pipe(Schema.brand("BufferId"));
export const Block = Schema.String.pipe(Schema.brand("BlockId"));
export const Node = Schema.String.pipe(Schema.brand("NodeId"));
export const Tuple = Schema.String.pipe(Schema.brand("TupleId"));

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
