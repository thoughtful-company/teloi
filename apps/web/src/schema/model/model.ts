import { Schema } from "effect";
import { Entity } from "../entity";
import { Id } from "../id";

export const DocumentName = {
  Window: "window",
  Pane: "pane",
  Buffer: "buffer",
  Block: "block",
  Selection: "selection",
} as const;

export type DocumentName = (typeof DocumentName)[keyof typeof DocumentName];

export const Window = Schema.Struct({
  panes: Schema.Array(Id.Pane),
  activeElement: Schema.NullOr(Entity.Element),
});
export type Window = typeof Window.Type;

export const Pane = Schema.Struct({
  parent: Entity.Window,
  buffers: Schema.Array(Id.Buffer),
});
export type Pane = typeof Pane.Type;

export const BufferSelection = Schema.Struct({
  anchorBlockId: Id.Block,
  anchorOffset: Schema.Number,
  focusBlockId: Id.Block,
  focusOffset: Schema.Number,
  goalX: Schema.NullOr(Schema.Number),
});
export type BufferSelection = typeof BufferSelection.Type;

export const EditorBuffer = Schema.mutable(
  Schema.Struct({
    windowId: Id.Window,
    parent: Entity.Pane,
    assignedNodeId: Schema.NullOr(Schema.String),
    selectedNodes: Schema.mutable(Schema.Array(Schema.Array(Schema.Number))),
    toggledNodes: Schema.mutable(Schema.Array(Schema.String)),
    selection: Schema.NullOr(BufferSelection),
  }),
);
export type EditorBuffer = typeof EditorBuffer.Type;

export const Block = Schema.Struct({
  isSelected: Schema.Boolean,
  isToggled: Schema.Boolean,
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
  [DocumentName.Buffer]: {
    schema: Schema.NullOr(EditorBuffer),
  },
  [DocumentName.Block]: {
    schema: Schema.NullOr(Block),
  },
  [DocumentName.Selection]: {
    schema: Schema.NullOr(Selection),
  },
} as const;
