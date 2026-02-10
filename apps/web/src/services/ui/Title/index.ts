import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
import { WorldT } from "@/services/ui/World";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { blur } from "./blur";
import { navigateToFirstChild } from "./navigation";
import { subscribe, type TitleSelection, type TitleView } from "./subscribe";

export type { TitleSelection, TitleView };

export class TitleT extends Context.Tag("TitleT")<
  TitleT,
  {
    subscribe: (
      frameId: Id.Frame,
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<TitleView>>;
    navigateToFirstChild: (
      frameId: Id.Frame,
      nodeId: Id.Node,
      goalX?: number,
    ) => Effect.Effect<void>;
    blur: (frameId: Id.Frame, nodeId: Id.Node) => Effect.Effect<void>;
  }
>() {}

export const TitleLive = Layer.effect(
  TitleT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const World = yield* WorldT;
    const Automerge = yield* AutomergeT;
    const Frame = yield* FrameT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(WorldT, World),
      Context.add(AutomergeT, Automerge),
      Context.add(FrameT, Frame),
    );

    return {
      subscribe: withContext(subscribe)(context),
      navigateToFirstChild: withContext(navigateToFirstChild)(context),
      blur: withContext(blur)(context),
    };
  }),
);
