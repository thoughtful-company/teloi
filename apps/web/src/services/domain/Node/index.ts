import { TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Either, Layer, Stream } from "effect";
import { NodeNotFoundError } from "../errors";
import { attestExistence } from "./attestExistence";
import { setNodeText } from "./setNodeText";
import { subscribe } from "./subscribe";
import { subscribeChildren } from "./subscribeChildren";
import { subscribeEither } from "./subscribeEither";

export class NodeT extends Context.Tag("NodeT")<
  NodeT,
  {
    subscribe: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<TeloiNode, NodeNotFoundError>>;
    subscribeEither: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<Either.Either<TeloiNode, NodeNotFoundError>>>;
    subscribeChildren: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly string[]>>;
    attestExistence: (nodeId: Id.Node) => Effect.Effect<void, NodeNotFoundError>;
    setNodeText: (
      nodeId: Id.Node,
      textContent: string,
    ) => Effect.Effect<void, NodeNotFoundError>;
  }
>() {}

export const NodeLive = Layer.effect(
  NodeT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const context = Context.make(StoreT, Store);

    return {
      subscribe: withContext(subscribe)(context),
      subscribeEither: withContext(subscribeEither)(context),
      subscribeChildren: withContext(subscribeChildren)(context),
      attestExistence: withContext(attestExistence)(context),
      setNodeText: withContext(setNodeText)(context),
    };
  }),
);
