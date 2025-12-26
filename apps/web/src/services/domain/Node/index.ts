import { TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Either, Layer, Stream } from "effect";
import { NodeHasNoParentError, NodeInsertError, NodeNotFoundError } from "../errors";
import { attestExistence } from "./attestExistence";
import { get } from "./get";
import { getNodeChildren } from "./getNodeChildren";
import { getParent } from "./getParent";
import { insertNode, InsertNodeArgs } from "./insertNode";
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
    /**
     * Inserts a new node or moves an existing node in the tree structure.
     * If nodeId exists, the node is moved; otherwise, a new node is created.
     */
    insertNode: (
      args: InsertNodeArgs,
    ) => Effect.Effect<Id.Node, NodeNotFoundError | NodeInsertError>;
    /**
     * Get the parent ID of a node.
     */
    getParent: (nodeId: Id.Node) => Effect.Effect<Id.Node, NodeHasNoParentError>;
    /**
     * Gets all direct children of the specified node.
     * Returns child node IDs in order by position.
     */
    getNodeChildren: (nodeId: Id.Node) => Effect.Effect<readonly Id.Node[]>;
    /**
     * Gets a node by ID.
     */
    get: (nodeId: Id.Node) => Effect.Effect<TeloiNode, NodeNotFoundError>;
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
      insertNode: withContext(insertNode)(context),
      getParent: withContext(getParent)(context),
      getNodeChildren: withContext(getNodeChildren)(context),
      get: withContext(get)(context),
    };
  }),
);

export type { InsertNodeArgs } from "./insertNode";
