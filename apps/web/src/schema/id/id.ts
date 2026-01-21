import { Data, Effect, ParseResult, Schema } from "effect";

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

// Block context schemas
const BufferBlockContext = Schema.Struct({
  type: Schema.Literal("buffer"),
  bufferId: Buffer,
  nodeId: Node,
});

const SectionBlockContext = Schema.Struct({
  type: Schema.Literal("section"),
  bufferId: Buffer,
  hostNodeId: Node,
  propertyId: Node,
  tupleId: Tuple,
});

const BlockContextSchema = Schema.Union(
  BufferBlockContext,
  SectionBlockContext,
);
export type BlockContext = typeof BlockContextSchema.Type;

// Virtual tuple sentinel for bound properties with no linked blocks
export const VIRTUAL_TUPLE = Tuple.make("__virtual__");

// Block ID format: buffer:{bufferId}/node:{nodeId}
export const makeBufferBlockId = (bufferId: Buffer, nodeId: Node): Block =>
  Block.make(`buffer:${bufferId}/node:${nodeId}`);

// Property block ID format: buffer:{bufferId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}
export const makePropertyBlockId = (
  bufferId: Buffer,
  hostNodeId: Node,
  propertyId: Node,
  tupleId: Tuple,
): Block =>
  Block.make(
    `buffer:${bufferId}/node:${hostNodeId}/property:${propertyId}/tuple:${tupleId}`,
  );

/** @deprecated Use makePropertyBlockId instead */
export const makeSectionBlockId = (sectionId: Section, nodeId: Node): Block =>
  Block.make(`section:${sectionId}/node:${nodeId}`);

// Section ID format: buffer:{bufferId}/section:{name} or block:{blockId}/section:{name}
export const makeBufferSectionId = (bufferId: Buffer, name: string): Section =>
  Section.make(`buffer:${bufferId}/section:${name}`);

export const makeBlockSectionId = (blockId: Block, name: string): Section =>
  Section.make(`block:${blockId}/section:${name}`);

// Property section ID format: buffer:{bufferId}/node:{hostNodeId}/property:{propertyId}
export const makePropertySectionId = (
  bufferId: Buffer,
  hostNodeId: Node,
  propertyId: Node,
): Section =>
  Section.make(`buffer:${bufferId}/node:${hostNodeId}/property:${propertyId}`);

export class InvalidBlockIdError extends Data.TaggedError(
  "InvalidBlockIdError",
)<{
  blockId: string;
}> {}

export class InvalidSectionIdError extends Data.TaggedError(
  "InvalidSectionIdError",
)<{
  sectionId: string;
}> {}

const BUFFER_BLOCK_PREFIX = "buffer:";
const NODE_SEGMENT = "/node:";
const PROPERTY_SEGMENT = "/property:";
const TUPLE_SEGMENT = "/tuple:";

/**
 * Schema that decodes a Block ID string into a BlockContext.
 *
 * Handles two formats:
 * - Buffer block: `buffer:{bufferId}/node:{nodeId}`
 * - Section block: `buffer:{bufferId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}`
 */
export const BlockContextFromBlockId = Schema.transformOrFail(
  Block,
  BlockContextSchema,
  {
    strict: true,
    decode: (blockId, _options, ast) => {
      if (!blockId.startsWith(BUFFER_BLOCK_PREFIX)) {
        return ParseResult.fail(
          new ParseResult.Type(
            ast,
            blockId,
            "Block ID must start with 'buffer:'",
          ),
        );
      }

      const nodeIndex = blockId.indexOf(NODE_SEGMENT);
      if (nodeIndex === -1) {
        return ParseResult.fail(
          new ParseResult.Type(ast, blockId, "Missing '/node:' segment"),
        );
      }

      const bufferId = blockId.slice(BUFFER_BLOCK_PREFIX.length, nodeIndex);
      const afterNode = blockId.slice(nodeIndex + NODE_SEGMENT.length);

      // Check for property block format
      const propertyIndex = afterNode.indexOf(PROPERTY_SEGMENT);
      if (propertyIndex !== -1) {
        const hostNodeId = afterNode.slice(0, propertyIndex);
        const afterProperty = afterNode.slice(
          propertyIndex + PROPERTY_SEGMENT.length,
        );

        const tupleIndex = afterProperty.indexOf(TUPLE_SEGMENT);
        if (tupleIndex === -1) {
          return ParseResult.fail(
            new ParseResult.Type(
              ast,
              blockId,
              "Missing '/tuple:' segment in property block",
            ),
          );
        }

        const propertyId = afterProperty.slice(0, tupleIndex);
        const tupleId = afterProperty.slice(tupleIndex + TUPLE_SEGMENT.length);

        return ParseResult.succeed({
          type: "section" as const,
          bufferId: bufferId as Buffer,
          hostNodeId: hostNodeId as Node,
          propertyId: propertyId as Node,
          tupleId: tupleId as Tuple,
        });
      }

      // Simple buffer block format
      return ParseResult.succeed({
        type: "buffer" as const,
        bufferId: bufferId as Buffer,
        nodeId: afterNode as Node,
      });
    },
    encode: (context) => {
      if (context.type === "buffer") {
        return ParseResult.succeed(
          `buffer:${context.bufferId}/node:${context.nodeId}` as Block,
        );
      }
      return ParseResult.succeed(
        `buffer:${context.bufferId}/node:${context.hostNodeId}/property:${context.propertyId}/tuple:${context.tupleId}` as Block,
      );
    },
  },
);

/**
 * Parse a Block ID into a BlockContext.
 * Returns an Effect that fails with InvalidBlockIdError on invalid format.
 */
export const parseBlockContext = (
  blockId: Block,
): Effect.Effect<BlockContext, InvalidBlockIdError> =>
  Schema.decode(BlockContextFromBlockId)(blockId).pipe(
    Effect.mapError(() => new InvalidBlockIdError({ blockId })),
  );

/**
 * Parse a Block ID synchronously. Throws on invalid format.
 */
export const parseBlockContextSync = (blockId: Block): BlockContext =>
  Schema.decodeUnknownSync(BlockContextFromBlockId)(blockId);

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

const SECTION_SEGMENT = "/section:";

/** @deprecated Use parseBlockContext instead - section blocks now return bufferId directly */
// Parse bufferId from section ID format: buffer:{bufferId}/property:{propertyId}
// Also handles existing buffer:{bufferId}/section:{name} format
export const parseSectionBufferId = (
  sectionId: Section,
): Effect.Effect<Buffer, InvalidSectionIdError> => {
  if (sectionId.startsWith(BUFFER_BLOCK_PREFIX)) {
    // Handle buffer:{bufferId}/property:{propertyId}
    const propertyIndex = sectionId.indexOf(PROPERTY_SEGMENT);
    if (propertyIndex !== -1) {
      const bufferId = sectionId.slice(
        BUFFER_BLOCK_PREFIX.length,
        propertyIndex,
      );
      return Effect.succeed(Buffer.make(bufferId));
    }
    // Handle buffer:{bufferId}/section:{name}
    const sectionIndex = sectionId.indexOf(SECTION_SEGMENT);
    if (sectionIndex !== -1) {
      const bufferId = sectionId.slice(
        BUFFER_BLOCK_PREFIX.length,
        sectionIndex,
      );
      return Effect.succeed(Buffer.make(bufferId));
    }
  }
  return Effect.fail(new InvalidSectionIdError({ sectionId }));
};

