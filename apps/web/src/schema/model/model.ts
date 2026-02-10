import { Schema } from "effect";
import { Entity } from "../entity";
import { Id } from "../id";

export const DocumentName = {
  World: "world",
  /** @deprecated Use World */
  Window: "window",
  Pane: "pane",
  Frame: "frame",
  Block: "block",
} as const;

export type DocumentName = (typeof DocumentName)[keyof typeof DocumentName];

/** Target of a selection point - identified by elementId (BlockId format: frame:{frameId}/node:{nodeId}) */
export const SelectionTarget = Schema.Struct({
  elementId: Id.Block,
});
export type SelectionTarget = typeof SelectionTarget.Type;

export const FrameSelection = Schema.Struct({
  anchor: SelectionTarget,
  anchorOffset: Schema.Number,
  focus: SelectionTarget,
  focusOffset: Schema.Number,
  goalX: Schema.NullOr(Schema.Number),
  goalLine: Schema.NullOr(Schema.Literal("first", "last")),
  /** Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line */
  assoc: Schema.optionalWith(Schema.Literal(-1, 0, 1), { default: () => 0 }),
});
export type FrameSelection = typeof FrameSelection.Type;

export const ActiveRegion = Schema.Literal(
  "heavenbar",
  "stage",
  "dock-left",
  "dock-right",
  "dock-bottom",
  "floorbar",
);
export type ActiveRegion = typeof ActiveRegion.Type;

export const BlockSelection = Schema.Struct({
  anchor: Schema.Number,
  head: Schema.Number,
  /** Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line */
  assoc: Schema.optionalWith(Schema.Literal(-1, 0, 1), { default: () => 0 }),
});
export type BlockSelection = typeof BlockSelection.Type;

export const World = Schema.Struct({
  panes: Schema.Array(Id.Pane),
  activeRegion: Schema.optional(ActiveRegion),
  activeFrameId: Schema.optional(Schema.NullOr(Id.Frame)),
});
export type World = typeof World.Type;
/** @deprecated Use World */
export const Window = World;
/** @deprecated Use World */
export type Window = World;

export const Pane = Schema.Struct({
  parent: Schema.Struct({
    id: Id.World,
    /** @deprecated "window" is legacy compatibility */
    type: Schema.Literal("world", "window"),
  }),
  frames: Schema.Array(Id.Frame),
});
export type Pane = typeof Pane.Type;

export const TypePickerPopup = Schema.Struct({
  type: Schema.Literal("typePicker"),
  query: Schema.String,
});

export const FramePopup = Schema.Union(TypePickerPopup);
export type FramePopup = typeof FramePopup.Type;

export const Frame = Schema.mutable(
  Schema.Struct({
    worldId: Schema.optional(Schema.NullOr(Id.World)),
    /** @deprecated Use worldId */
    windowId: Schema.optional(Schema.NullOr(Id.World)),
    parent: Entity.Pane,
    assignedNodeId: Schema.NullOr(Schema.String),
    rootBlockId: Schema.optional(Schema.NullOr(Schema.String)),
    toggledNodes: Schema.mutable(Schema.Array(Schema.String)),
    /** Active view node ID - null means default page/tree view */
    activeViewId: Schema.NullOr(Id.Node),
    activePart: Schema.optional(Schema.Literal("head", "body")),
    activeBlockId: Schema.optional(Schema.NullOr(Id.Block)),
    selectedBlocks: Schema.optional(Schema.mutable(Schema.Array(Id.Node))),
    goalX: Schema.optional(Schema.NullOr(Schema.Number)),
    goalLine: Schema.optional(Schema.NullOr(Schema.Literal("first", "last"))),
    assoc: Schema.optional(Schema.Literal(-1, 0, 1)),
    /** Active popup state - null means no popup open */
    popup: Schema.NullOr(FramePopup),
  }),
);
export type Frame = typeof Frame.Type;

export const Block = Schema.Struct({
  isExpanded: Schema.Boolean,
  activeViewId: Schema.NullOr(Id.Node),
  ghostChildId: Schema.NullOr(Id.Node),
  ghostParentId: Schema.NullOr(Id.Node),
  selection: Schema.optional(Schema.NullOr(BlockSelection)),
});
export type Block = typeof Block.Type;

export const DocumentSchemas = {
  [DocumentName.World]: {
    schema: Schema.NullOr(World),
  },
  /** @deprecated Use DocumentName.World */
  [DocumentName.Window]: {
    schema: Schema.NullOr(World),
  },
  [DocumentName.Pane]: {
    schema: Schema.NullOr(Pane),
  },
  [DocumentName.Frame]: {
    schema: Schema.NullOr(Frame),
  },
  [DocumentName.Block]: {
    schema: Schema.NullOr(Block),
  },
} as const;
