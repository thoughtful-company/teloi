import { Data, Effect, ParseResult, Schema } from "effect";

// Base schema that only allows nanoid-safe characters (A-Za-z0-9_-)
const SafeIdString = Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]+$/));

// System IDs follow namespace:name format (e.g., "system:root", "workspace:home")
const SystemIdString = Schema.String.pipe(
  Schema.pattern(/^[a-z]+:[a-z0-9-]+$/),
);

export const World = SafeIdString.pipe(Schema.brand("WorldId"));
/** @deprecated Use World */
export const Window = World;
export const Pane = SafeIdString.pipe(Schema.brand("PaneId"));
export const Frame = SafeIdString.pipe(Schema.brand("FrameId"));
export const Node = Schema.Union(SafeIdString, SystemIdString).pipe(
  Schema.brand("NodeId"),
);
export const Tuple = SafeIdString.pipe(Schema.brand("TupleId"));

// Block and Section are composite IDs containing : and / delimiters
export const Block = Schema.String.pipe(Schema.brand("BlockId"));
export const Section = Schema.String.pipe(Schema.brand("SectionId"));

export type World = typeof World.Type;
/** @deprecated Use World */
export type Window = World;
export type Pane = typeof Pane.Type;
export type Frame = typeof Frame.Type;
export type Block = typeof Block.Type;
export type Node = typeof Node.Type;
export type Tuple = typeof Tuple.Type;
export type Section = typeof Section.Type;

// Block context schemas
const FrameBlockContext = Schema.Struct({
  type: Schema.Literal("frame"),
  frameId: Frame,
  nodeId: Node,
});

const SectionBlockContext = Schema.Struct({
  type: Schema.Literal("section"),
  frameId: Frame,
  hostNodeId: Node,
  propertyId: Node,
  tupleId: Tuple,
});

const BlockContextSchema = Schema.Union(FrameBlockContext, SectionBlockContext);
export type BlockContext = typeof BlockContextSchema.Type;

// Virtual tuple sentinel for bound properties with no linked blocks
export const VIRTUAL_TUPLE = Tuple.make("__virtual__");

// Block ID format: frame:{frameId}/node:{nodeId}
export const makeFrameBlockId = (frameId: Frame, nodeId: Node): Block =>
  Block.make(`frame:${frameId}/node:${nodeId}`);

// Property block ID format: frame:{frameId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}
export const makePropertyBlockId = (
  frameId: Frame,
  hostNodeId: Node,
  propertyId: Node,
  tupleId: Tuple,
): Block =>
  Block.make(
    `frame:${frameId}/node:${hostNodeId}/property:${propertyId}/tuple:${tupleId}`,
  );

/** @deprecated Use makePropertyBlockId instead */
export const makeSectionBlockId = (sectionId: Section, nodeId: Node): Block =>
  Block.make(`section:${sectionId}/node:${nodeId}`);

// Section ID format: frame:{frameId}/section:{name} or block:{blockId}/section:{name}
export const makeFrameSectionId = (frameId: Frame, name: string): Section =>
  Section.make(`frame:${frameId}/section:${name}`);

export const makeBlockSectionId = (blockId: Block, name: string): Section =>
  Section.make(`block:${blockId}/section:${name}`);

// Property section ID format: frame:{frameId}/node:{hostNodeId}/property:{propertyId}
export const makePropertySectionId = (
  frameId: Frame,
  hostNodeId: Node,
  propertyId: Node,
): Section =>
  Section.make(`frame:${frameId}/node:${hostNodeId}/property:${propertyId}`);

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

const FRAME_BLOCK_PREFIX = "frame:";
const NODE_SEGMENT = "/node:";
const PROPERTY_SEGMENT = "/property:";
const TUPLE_SEGMENT = "/tuple:";

/**
 * Schema that decodes a Block ID string into a BlockContext.
 *
 * Handles two formats:
 * - Frame block: `frame:{frameId}/node:{nodeId}`
 * - Section block: `frame:{frameId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}`
 */
export const BlockContextFromBlockId = Schema.transformOrFail(
  Block,
  BlockContextSchema,
  {
    strict: true,
    decode: (blockId, _options, ast) => {
      if (!blockId.startsWith(FRAME_BLOCK_PREFIX)) {
        return ParseResult.fail(
          new ParseResult.Type(
            ast,
            blockId,
            "Block ID must start with 'frame:'",
          ),
        );
      }

      const nodeIndex = blockId.indexOf(NODE_SEGMENT);
      if (nodeIndex === -1) {
        return ParseResult.fail(
          new ParseResult.Type(ast, blockId, "Missing '/node:' segment"),
        );
      }

      const frameId = blockId.slice(FRAME_BLOCK_PREFIX.length, nodeIndex);
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
          frameId: frameId as Frame,
          hostNodeId: hostNodeId as Node,
          propertyId: propertyId as Node,
          tupleId: tupleId as Tuple,
        });
      }

      // Simple frame block format
      return ParseResult.succeed({
        type: "frame" as const,
        frameId: frameId as Frame,
        nodeId: afterNode as Node,
      });
    },
    encode: (context) => {
      if (context.type === "frame") {
        return ParseResult.succeed(
          `frame:${context.frameId}/node:${context.nodeId}` as Block,
        );
      }
      return ParseResult.succeed(
        `frame:${context.frameId}/node:${context.hostNodeId}/property:${context.propertyId}/tuple:${context.tupleId}` as Block,
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

// Backwards-compatible parser for frame blocks only
// Returns Effect<[Frame, Node]> like the old parseBlockId
export const parseBlockId = (
  blockId: Block,
): Effect.Effect<[Frame, Node], InvalidBlockIdError> =>
  parseBlockContext(blockId).pipe(
    Effect.flatMap((context) => {
      if (context.type === "frame") {
        return Effect.succeed([context.frameId, context.nodeId] as const);
      }
      return Effect.fail(new InvalidBlockIdError({ blockId }));
    }),
  );

const SECTION_SEGMENT = "/section:";

/** @deprecated Use parseBlockContext instead - section blocks now return frameId directly */
// Parse frameId from section ID format: frame:{frameId}/property:{propertyId}
// Also handles existing frame:{frameId}/section:{name} format
export const parseSectionFrameId = (
  sectionId: Section,
): Effect.Effect<Frame, InvalidSectionIdError> => {
  if (sectionId.startsWith(FRAME_BLOCK_PREFIX)) {
    // Handle frame:{frameId}/property:{propertyId}
    const propertyIndex = sectionId.indexOf(PROPERTY_SEGMENT);
    if (propertyIndex !== -1) {
      const frameId = sectionId.slice(FRAME_BLOCK_PREFIX.length, propertyIndex);
      return Effect.succeed(Frame.make(frameId));
    }
    // Handle frame:{frameId}/section:{name}
    const sectionIndex = sectionId.indexOf(SECTION_SEGMENT);
    if (sectionIndex !== -1) {
      const frameId = sectionId.slice(FRAME_BLOCK_PREFIX.length, sectionIndex);
      return Effect.succeed(Frame.make(frameId));
    }
  }
  return Effect.fail(new InvalidSectionIdError({ sectionId }));
};
