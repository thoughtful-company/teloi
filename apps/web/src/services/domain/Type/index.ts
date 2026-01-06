import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { addType } from "./addType";
import { getTypes } from "./getTypes";
import { hasType } from "./hasType";
import { removeType } from "./removeType";
import { subscribeTypes } from "./subscribeTypes";

export class TypeT extends Context.Tag("TypeT")<
  TypeT,
  {
    /**
     * Add a type to a node. No-op if the node already has this type.
     */
    addType: (nodeId: Id.Node, typeId: Id.Node) => Effect.Effect<void>;
    /**
     * Remove a type from a node.
     */
    removeType: (nodeId: Id.Node, typeId: Id.Node) => Effect.Effect<void>;
    /**
     * Get all types for a node, ordered by position.
     */
    getTypes: (nodeId: Id.Node) => Effect.Effect<readonly Id.Node[]>;
    /**
     * Check if a node has a specific type.
     */
    hasType: (nodeId: Id.Node, typeId: Id.Node) => Effect.Effect<boolean>;
    /**
     * Subscribe to types for a node. Emits ordered list of type IDs whenever types change.
     */
    subscribeTypes: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly Id.Node[]>>;
  }
>() {}

export const TypeLive = Layer.effect(
  TypeT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const context = Context.make(StoreT, Store);

    return {
      addType: withContext(addType)(context),
      removeType: withContext(removeType)(context),
      getTypes: withContext(getTypes)(context),
      hasType: withContext(hasType)(context),
      subscribeTypes: withContext(subscribeTypes)(context),
    };
  }),
);
