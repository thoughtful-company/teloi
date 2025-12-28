import { Id } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { attestExistence } from "./attestExistence";
import { BlockGoneError, BlockNotFoundError } from "./errors";
import { BlockView, subscribe } from "./subscribe";

export { BlockGoneError, BlockNotFoundError } from "./errors";
export type { BlockView } from "./subscribe";

export class BlockT extends Context.Tag("BlockT")<
  BlockT,
  {
    subscribe: (
      blockId: Id.Block,
    ) => Effect.Effect<
      Stream.Stream<BlockView, BlockGoneError>,
      BlockNotFoundError | NodeNotFoundError | Id.InvalidBlockIdError
    >;
    attestExistence: (
      blockId: Id.Block,
    ) => Effect.Effect<void, BlockNotFoundError>;
  }
>() {}

export const BlockLive = Layer.effect(
  BlockT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Window = yield* WindowT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(WindowT, Window),
    );

    return {
      subscribe: withContext(subscribe)(context),
      attestExistence: withContext(attestExistence)(context),
    };
  }),
);
