import { Data, Effect, Schema } from "effect";

// Base schema that only allows nanoid-safe characters (A-Za-z0-9_-)
const SafeIdString = Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]+$/));

export const Window = SafeIdString.pipe(Schema.brand("WindowId"));
export const Pane = SafeIdString.pipe(Schema.brand("PaneId"));
export const Buffer = SafeIdString.pipe(Schema.brand("BufferId"));
export const Node = SafeIdString.pipe(Schema.brand("NodeId"));
export const Tuple = SafeIdString.pipe(Schema.brand("TupleId"));

// Block and Section are composite IDs containing : and / delimiters
export const Block = Schema.String.pipe(Schema.brand("BlockId"));
export const Section = Schema.String.pipe(Schema.brand("SectionId"));

export type Window = typeof Window.Type;
export type Pane = typeof Pane.Type;
export type Buffer = typeof Buffer.Type;
export type Block = typeof Block.Type;
export type Node = typeof Node.Type;
export type Tuple = typeof Tuple.Type;
export type Section = typeof Section.Type;

// Block context discriminated union
export type BlockContext =
  | { type: "buffer"; bufferId: Buffer; nodeId: Node }
  | { type: "section"; sectionId: Section; nodeId: Node };

// Block ID format: buffer:{bufferId}/node:{nodeId} or section:{sectionId}/node:{nodeId}
export const makeBufferBlockId = (bufferId: Buffer, nodeId: Node): Block =>
  Block.make(`buffer:${bufferId}/node:${nodeId}`);

export const makeSectionBlockId = (sectionId: Section, nodeId: Node): Block =>
  Block.make(`section:${sectionId}/node:${nodeId}`);

// Section ID format: buffer:{bufferId}/section:{name} or block:{blockId}/section:{name}
export const makeBufferSectionId = (bufferId: Buffer, name: string): Section =>
  Section.make(`buffer:${bufferId}/section:${name}`);

export const makeBlockSectionId = (blockId: Block, name: string): Section =>
  Section.make(`block:${blockId}/section:${name}`);

export class InvalidBlockIdError extends Data.TaggedError(
  "InvalidBlockIdError",
)<{
  blockId: string;
}> {}

const BUFFER_BLOCK_PREFIX = "buffer:";
const SECTION_BLOCK_PREFIX = "section:";
const NODE_SEGMENT = "/node:";

export const parseBlockContext = (
  blockId: Block,
): Effect.Effect<BlockContext, InvalidBlockIdError> => {
  if (blockId.startsWith(BUFFER_BLOCK_PREFIX)) {
    const nodeIndex = blockId.indexOf(NODE_SEGMENT);
    if (nodeIndex === -1) {
      return Effect.fail(new InvalidBlockIdError({ blockId }));
    }
    const bufferId = blockId.slice(BUFFER_BLOCK_PREFIX.length, nodeIndex);
    const nodeId = blockId.slice(nodeIndex + NODE_SEGMENT.length);
    return Effect.succeed({
      type: "buffer",
      bufferId: Buffer.make(bufferId),
      nodeId: Node.make(nodeId),
    });
  }

  if (blockId.startsWith(SECTION_BLOCK_PREFIX)) {
    const nodeIndex = blockId.indexOf(NODE_SEGMENT);
    if (nodeIndex === -1) {
      return Effect.fail(new InvalidBlockIdError({ blockId }));
    }
    const sectionId = blockId.slice(SECTION_BLOCK_PREFIX.length, nodeIndex);
    const nodeId = blockId.slice(nodeIndex + NODE_SEGMENT.length);
    return Effect.succeed({
      type: "section",
      sectionId: Section.make(sectionId),
      nodeId: Node.make(nodeId),
    });
  }

  return Effect.fail(new InvalidBlockIdError({ blockId }));
};

// Backwards-compatible parser for buffer blocks only
// Returns Effect<[Buffer, Node]> like the old parseBlockId
export const parseBlockId = (
  blockId: Block,
): Effect.Effect<[Buffer, Node], InvalidBlockIdError> =>
  parseBlockContext(blockId).pipe(
    Effect.flatMap((context) => {
      if (context.type === "buffer") {
        return Effect.succeed([context.bufferId, context.nodeId] as const);
      }
      return Effect.fail(new InvalidBlockIdError({ blockId }));
    }),
  );
