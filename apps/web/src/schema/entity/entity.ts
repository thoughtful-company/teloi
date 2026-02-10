import { Schema } from "effect";
import { Id } from "../id";

export const World = Schema.Struct({
  id: Id.World,
  type: Schema.Literal("world"),
});
export type World = typeof World.Type;

export const Pane = Schema.Struct({
  id: Id.Pane,
  type: Schema.Literal("pane"),
});
export type Pane = typeof Pane.Type;

export const Frame = Schema.Struct({
  id: Id.Frame,
  type: Schema.Literal("frame"),
});
export type Frame = typeof Frame.Type;

export const Block = Schema.Struct({
  id: Id.Block,
  type: Schema.Literal("block"),
});
export type Block = typeof Block.Type;

export const Title = Schema.Struct({
  frameId: Id.Frame,
  type: Schema.Literal("title"),
});
export type Title = typeof Title.Type;

export const Property = Schema.Struct({
  propertyId: Id.Node,
  frameId: Id.Frame,
  type: Schema.Literal("property"),
});
export type Property = typeof Property.Type;

export const Element = Schema.Union(
  World,
  Pane,
  Frame,
  Block,
  Title,
  Property,
);
export type Element = typeof Element.Type;
