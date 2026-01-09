import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { blur } from "./blur";
import { enter, type EnterParams } from "./enter";
import { navigateToFirstChild } from "./navigation";
import { subscribe, type TitleSelection, type TitleView } from "./subscribe";

export type { EnterParams, TitleSelection, TitleView };

export class TitleT extends Context.Tag("TitleT")<
  TitleT,
  {
    subscribe: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<TitleView>>;
    navigateToFirstChild: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
      goalX?: number,
    ) => Effect.Effect<void>;
    enter: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
      params: EnterParams,
    ) => Effect.Effect<void>;
    blur: (bufferId: Id.Buffer) => Effect.Effect<void>;
  }
>() {}

export const TitleLive = Layer.effect(
  TitleT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Window = yield* WindowT;
    const Yjs = yield* YjsT;
    const Buffer = yield* BufferT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(WindowT, Window),
      Context.add(YjsT, Yjs),
      Context.add(BufferT, Buffer),
    );

    return {
      subscribe: withContext(subscribe)(context),
      navigateToFirstChild: withContext(navigateToFirstChild)(context),
      enter: withContext(enter)(context),
      blur: withContext(blur)(context),
    };
  }),
);
