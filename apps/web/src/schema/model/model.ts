import { Schema } from "effect";
import { Entity } from "../entity";
import { Id } from "../id";

export const DocumentName = {
  Window: "window",
  Pane: "pane",
  Frame: "frame",
  Block: "block",
  Selection: "selection",
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

export const Window = Schema.Struct({
  panes: Schema.Array(Id.Pane),
  activeRegion: Schema.optional(ActiveRegion),
  activeFrameId: Schema.optional(Schema.NullOr(Id.Frame)),
  /** Anchor of block selection - fixed endpoint where Escape was pressed */
  blockSelectionAnchor: Schema.NullOr(Id.Node),
  /** Focus of block selection - moves with arrow keys, selection is range from anchor to focus */
  blockSelectionFocus: Schema.NullOr(Id.Node),
  /** Last focused block - preserved across selection clear for arrow key restoration */
  lastFocusedBlockId: Schema.NullOr(Id.Node),
});
export type Window = typeof Window.Type;

export const Pane = Schema.Struct({
  parent: Entity.Window,
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
    windowId: Id.Window,
    parent: Entity.Pane,
    assignedNodeId: Schema.NullOr(Schema.String),
    rootBlockId: Schema.optional(Schema.NullOr(Schema.String)),
    toggledNodes: Schema.mutable(Schema.Array(Schema.String)),
    /** Active view node ID - null means default page/tree view */
    activeViewId: Schema.NullOr(Id.Node),
    activePart: Schema.optional(Schema.Literal("head", "body")),
    activeBlockId: Schema.optional(Schema.NullOr(Id.Block)),
    selectedBlocks: Schema.optional(Schema.mutable(Schema.Array(Id.Node))),
    /** Anchor of block selection - fixed endpoint where block selection started */
    blockSelectionAnchor: Schema.optional(Schema.NullOr(Id.Node)),
    /** Focus of block selection - moving endpoint where block selection currently ends */
    blockSelectionFocus: Schema.optional(Schema.NullOr(Id.Node)),
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

export const Selection = Schema.Struct({
  anchorElement: Entity.Element,
  anchorOffset: Schema.Number,
  focusElement: Entity.Element,
  focusOffset: Schema.Number,
});
export type Selection = typeof Selection.Type;

export const DocumentSchemas = {
  [DocumentName.Window]: {
    schema: Schema.NullOr(Window),
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
  [DocumentName.Selection]: {
    schema: Schema.NullOr(Selection),
  },
} as const;
