import { Id } from "@/schema";
import { Context, Effect, Layer, Option } from "effect";
import { makePageViewNavigation } from "./page";

export class ViewNavigationT extends Context.Tag("ViewNavigationT")<
  ViewNavigationT,
  {
    resolveBlockAbove: (
      nodeId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>>;

    resolveBlockBelow: (
      nodeId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>>;

    resolveBlockLeft: (
      nodeId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>>;

    resolveBlockRight: (
      nodeId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>>;

    createBlock: (
      nodeId: Id.Node,
      bufferId: Id.Buffer,
      position: "before" | "after",
    ) => Effect.Effect<Id.Node>;
  }
>() {}

export const ViewNavigationLive = Layer.effect(
  ViewNavigationT,
  makePageViewNavigation,
);
