import { Data, Effect, ParseResult, Schema } from "effect";

// Base schema that only allows nanoid-safe characters (A-Za-z0-9_-)
const SafeIdString = Schema.String.pipe(Schema.pattern(/^[A-Za-z0-9_-]+$/));

// System IDs follow namespace:name format (e.g., "system:root", "workspace:home")
const SystemIdString = Schema.String.pipe(
  Schema.pattern(/^[a-z]+:[a-z0-9-]+$/),
);

export const World = SafeIdString.pipe(Schema.brand("WorldId"));
export const Pane = SafeIdString.pipe(Schema.brand("PaneId"));
export const Frame = SafeIdString.pipe(Schema.brand("FrameId"));
export const Node = Schema.Union(SafeIdString, SystemIdString).pipe(
  Schema.brand("NodeId"),
);
export const Tuple = SafeIdString.pipe(Schema.brand("TupleId"));

// Khora and Section are composite IDs containing : and / delimiters
export const Khora = Schema.String.pipe(Schema.brand("KhoraId"));
export const Section = Schema.String.pipe(Schema.brand("SectionId"));

export type World = typeof World.Type;
export type Pane = typeof Pane.Type;
export type Frame = typeof Frame.Type;
export type Khora = typeof Khora.Type;
export type Node = typeof Node.Type;
export type Tuple = typeof Tuple.Type;
export type Section = typeof Section.Type;

// Block context schemas
const FrameKhoraContext = Schema.Struct({
  type: Schema.Literal("frame"),
  frameId: Frame,
  nodeId: Node,
});

const SectionKhoraContext = Schema.Struct({
  type: Schema.Literal("section"),
  frameId: Frame,
  hostNodeId: Node,
  propertyId: Node,
  tupleId: Tuple,
});

const KhoraContextSchema = Schema.Union(FrameKhoraContext, SectionKhoraContext);
export type KhoraContext = typeof KhoraContextSchema.Type;

// Virtual tuple sentinel for bound properties with no linked blocks
export const VIRTUAL_TUPLE = Tuple.make("__virtual__");

// Block ID format: frame:{frameId}/node:{nodeId}
export const makeFrameKhoraId = (frameId: Frame, nodeId: Node): Khora =>
  Khora.make(`frame:${frameId}/node:${nodeId}`);

// Property block ID format: frame:{frameId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}
export const makePropertyKhoraId = (
  frameId: Frame,
  hostNodeId: Node,
  propertyId: Node,
  tupleId: Tuple,
): Khora =>
  Khora.make(
    `frame:${frameId}/node:${hostNodeId}/property:${propertyId}/tuple:${tupleId}`,
  );

/** @deprecated Use makePropertyKhoraId instead */
export const makeSectionKhoraId = (sectionId: Section, nodeId: Node): Khora =>
  Khora.make(`section:${sectionId}/node:${nodeId}`);

// Section ID format: frame:{frameId}/section:{name} or block:{khoraId}/section:{name}
export const makeFrameSectionId = (frameId: Frame, name: string): Section =>
  Section.make(`frame:${frameId}/section:${name}`);

export const makeKhoraSectionId = (khoraId: Khora, name: string): Section =>
  Section.make(`block:${khoraId}/section:${name}`);

// Property section ID format: frame:{frameId}/node:{hostNodeId}/property:{propertyId}
export const makePropertySectionId = (
  frameId: Frame,
  hostNodeId: Node,
  propertyId: Node,
): Section =>
  Section.make(`frame:${frameId}/node:${hostNodeId}/property:${propertyId}`);

export class InvalidKhoraIdError extends Data.TaggedError(
  "InvalidKhoraIdError",
)<{
  khoraId: string;
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
 * Schema that decodes a Block ID string into a KhoraContext.
 *
 * Handles two formats:
 * - Frame block: `frame:{frameId}/node:{nodeId}`
 * - Section block: `frame:{frameId}/node:{hostNodeId}/property:{propertyId}/tuple:{tupleId}`
 */
export const KhoraContextFromKhoraId = Schema.transformOrFail(
  Khora,
  KhoraContextSchema,
  {
    strict: true,
    decode: (khoraId, _options, ast) => {
      if (!khoraId.startsWith(FRAME_BLOCK_PREFIX)) {
        return ParseResult.fail(
          new ParseResult.Type(
            ast,
            khoraId,
            "Block ID must start with 'frame:'",
          ),
        );
      }

      const nodeIndex = khoraId.indexOf(NODE_SEGMENT);
      if (nodeIndex === -1) {
        return ParseResult.fail(
          new ParseResult.Type(ast, khoraId, "Missing '/node:' segment"),
        );
      }

      const frameId = khoraId.slice(FRAME_BLOCK_PREFIX.length, nodeIndex);
      const afterNode = khoraId.slice(nodeIndex + NODE_SEGMENT.length);

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
              khoraId,
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
          `frame:${context.frameId}/node:${context.nodeId}` as Khora,
        );
      }
      return ParseResult.succeed(
        `frame:${context.frameId}/node:${context.hostNodeId}/property:${context.propertyId}/tuple:${context.tupleId}` as Khora,
      );
    },
  },
);

/**
 * Parse a Block ID into a KhoraContext.
 * Returns an Effect that fails with InvalidKhoraIdError on invalid format.
 */
export const parseKhoraContext = (
  khoraId: Khora,
): Effect.Effect<KhoraContext, InvalidKhoraIdError> =>
  Schema.decode(KhoraContextFromKhoraId)(khoraId).pipe(
    Effect.mapError(() => new InvalidKhoraIdError({ khoraId })),
  );

/**
 * Parse a Block ID synchronously. Throws on invalid format.
 */
export const parseKhoraContextSync = (khoraId: Khora): KhoraContext =>
  Schema.decodeUnknownSync(KhoraContextFromKhoraId)(khoraId);

export const khoraIdToNodeId = (khoraId: Khora): Node => {
  const ctx = parseKhoraContextSync(khoraId);
  return ctx.type === "frame" ? ctx.nodeId : ctx.hostNodeId;
};

export const khoraIdsToNodeIds = (khoraIds: readonly Khora[]): Node[] =>
  khoraIds.map(khoraIdToNodeId);

export const parseKhoraId = (
  khoraId: Khora,
): Effect.Effect<[Frame, Node], InvalidKhoraIdError> =>
  parseKhoraContext(khoraId).pipe(
    Effect.flatMap((context) => {
      if (context.type === "frame") {
        return Effect.succeed([context.frameId, context.nodeId] as const);
      }
      return Effect.fail(new InvalidKhoraIdError({ khoraId }));
    }),
  );

const SECTION_SEGMENT = "/section:";

/** @deprecated Use parseKhoraContext instead - section blocks now return frameId directly */
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
