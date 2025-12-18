import { Context, Effect, Layer, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { BufferNodeNotAssignedError, BufferNotFoundError } from "../errors";
import { BufferView, subscribe } from "./subscribe";

export class BufferT extends Context.Tag("BufferT")<
  BufferT,
  {
    subscribe: (
      bufferId: Id.Buffer,
    ) => Effect.Effect<
      Stream.Stream<BufferView, NodeNotFoundError>,
      BufferNotFoundError | LiveStoreError | BufferNodeNotAssignedError | NodeNotFoundError
    >;
  }
>() {}

export const BufferLive = Layer.effect(
  BufferT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
    );

    return {
      subscribe: withContext(subscribe)(context),
    };
  }),
);
