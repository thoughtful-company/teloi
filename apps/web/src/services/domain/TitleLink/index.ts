import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
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
  }
>() {}

export const TitleLinkLive = Layer.effect(
  TitleLinkT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const context = Context.make(StoreT, Store);

    return {
      get: withContext(get)(context),
      subscribe: withContext(subscribe)(context),
    };
  }),
);
