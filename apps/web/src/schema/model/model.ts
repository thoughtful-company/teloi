import { Schema } from "effect";
import { Entity } from "../entity";
import { Id } from "../id";

export const DocumentName = {
  World: "world",
  Pane: "pane",
  Frame: "frame",
  Khora: "khora",
} as const;

export type DocumentName = (typeof DocumentName)[keyof typeof DocumentName];

export const ActiveRegion = Schema.Literal(
  "heavenbar",
  "stage",
  "dock-left",
  "dock-right",
  "dock-bottom",
  "floorbar",
);
export type ActiveRegion = typeof ActiveRegion.Type;

export const KhoraTextSelection = Schema.Struct({
  anchor: Schema.Number,
  head: Schema.Number,
  /** Cursor association at wrap boundaries: -1 = end of prev line, 0 = no preference, 1 = start of next line */
  assoc: Schema.optionalWith(Schema.Literal(-1, 0, 1), { default: () => 0 }),
});
export type KhoraTextSelection = typeof KhoraTextSelection.Type;

export const ActiveKhoraSelection = Schema.Struct({
  khoraId: Id.Khora,
  selection: KhoraTextSelection,
  goalX: Schema.NullOr(Schema.Number),
  goalLine: Schema.NullOr(Schema.Literal("first", "last")),
});
export type ActiveKhoraSelection = typeof ActiveKhoraSelection.Type;

export const World = Schema.Struct({
  panes: Schema.Array(Id.Pane),
  activeRegion: Schema.optional(ActiveRegion),
  activeFrameId: Schema.optional(Schema.NullOr(Id.Frame)),
});
export type World = typeof World.Type;

export const Pane = Schema.Struct({
  parent: Entity.World,
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
    worldId: Id.World,
    parent: Entity.Pane,
    assignedNodeId: Schema.NullOr(Schema.String),
    rootKhoraId: Schema.optional(Schema.NullOr(Schema.String)),
    toggledNodes: Schema.mutable(Schema.Array(Schema.String)),
    /** Active view node ID - null means default page/tree view */
    activeViewId: Schema.NullOr(Id.Node),
    activePart: Schema.optional(Schema.Literal("head", "body")),
    selection: Schema.optional(Schema.NullOr(ActiveKhoraSelection)),
    focusMode: Schema.optional(Schema.Literal("editing", "khoraSelection")),
    khoraSelectionAnchor: Schema.optional(Schema.NullOr(Id.Node)),
    khoraSelectionFocus: Schema.optional(Schema.NullOr(Id.Node)),
    selectedKhoras: Schema.optional(Schema.mutable(Schema.Array(Id.Node))),
    /** Active popup state - null means no popup open */
    popup: Schema.NullOr(FramePopup),
  }),
);
export type Frame = typeof Frame.Type;

export const Khora = Schema.Struct({
  isExpanded: Schema.Boolean,
  activeViewId: Schema.NullOr(Id.Node),
  ghostChildId: Schema.NullOr(Id.Node),
  ghostParentId: Schema.NullOr(Id.Node),
});
export type Khora = typeof Khora.Type;

export const DocumentSchemas = {
  [DocumentName.World]: {
    schema: Schema.NullOr(World),
  },
  [DocumentName.Pane]: {
    schema: Schema.NullOr(Pane),
  },
  [DocumentName.Frame]: {
    schema: Schema.NullOr(Frame),
  },
  [DocumentName.Khora]: {
    schema: Schema.NullOr(Khora),
  },
} as const;
