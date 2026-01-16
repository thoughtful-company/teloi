import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { detach } from "./detach";
import { get } from "./get";
import { subscribe } from "./subscribe";

/**
 * Title link data: which node's title to display and how.
 */
export type TitleLink = {
  sourceId: Id.Node;
  mode: "synced" | "readonly" | "detach";
};

export class TitleLinkT extends Context.Tag("TitleLinkT")<
  TitleLinkT,
  {
    /**
     * Get the title link for a node (if any).
     * Returns null if the node doesn't have a linked title.
     */
    get: (nodeId: Id.Node) => Effect.Effect<TitleLink | null>;

    /**
     * Subscribe to title link changes for a node.
     * Emits null when no link exists, or the link data when it does.
     */
    subscribe: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<TitleLink | null>>;

    /**
     * Detach a node from its title link source.
     * Copies source text to the node's own Y.Text and deletes the tuple.
     */
    detach: (nodeId: Id.Node, sourceId: Id.Node) => Effect.Effect<void>;
  }
>() {}

export const TitleLinkLive = Layer.effect(
  TitleLinkT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;
    const context = Context.make(StoreT, Store).pipe(
      Context.add(TupleT, Tuple),
      Context.add(YjsT, Yjs),
    );

    return {
      get: withContext(get)(context),
      subscribe: withContext(subscribe)(context),
      detach: withContext(detach)(context),
    };
  }),
);
