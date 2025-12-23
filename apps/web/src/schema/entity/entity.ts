import { Schema } from "effect";
import { Id } from "../id";

export const Window = Schema.Struct({
  id: Id.Window,
  type: Schema.Literal("window"),
});
export type Window = typeof Window.Type;

export const Pane = Schema.Struct({
  id: Id.Pane,
  type: Schema.Literal("pane"),
});
export type Pane = typeof Pane.Type;

export const Buffer = Schema.Struct({
  id: Id.Buffer,
  type: Schema.Literal("buffer"),
});
export type Buffer = typeof Buffer.Type;

export const Block = Schema.Struct({
  id: Id.Block,
  type: Schema.Literal("block"),
});
export type Block = typeof Block.Type;

export const Title = Schema.Struct({
  bufferId: Id.Buffer,
  type: Schema.Literal("title"),
});
export type Title = typeof Title.Type;

export const Element = Schema.Union(Window, Pane, Buffer, Block, Title);
export type Element = typeof Element.Type;
