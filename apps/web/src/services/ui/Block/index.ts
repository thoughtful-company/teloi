import { Id } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { WindowT } from "@/services/ui/Window";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { attestExistence } from "./attestExistence";
import { BlockGoneError, BlockNotFoundError } from "./errors";
import {
  findDeepestLastChild,
  findNextNode,
  findNextNodeInDocumentOrder,
  findPreviousNode,
} from "./navigation";
import { split, type SplitParams, type SplitResult } from "./split";
import { BlockView, subscribe } from "./subscribe";
import { moveToFirst, moveToLast, swap } from "./swap";

export { BlockGoneError, BlockNotFoundError } from "./errors";
export type { BlockView } from "./subscribe";
export type { SplitParams, SplitResult };

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
    setExpanded: (
      blockId: Id.Block,
      isExpanded: boolean,
    ) => Effect.Effect<void, never>;
    isExpanded: (blockId: Id.Block) => Effect.Effect<boolean, never>;

    // Tree navigation
    findDeepestLastChild: (
      startNodeId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Id.Node, never>;
    findNextNode: (
      currentId: Id.Node,
    ) => Effect.Effect<Option.Option<Id.Node>, never>;
    findNextNodeInDocumentOrder: (
      currentId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>, never>;
    findPreviousNode: (
      currentId: Id.Node,
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>, never>;

    // Structural operations
    split: (params: SplitParams) => Effect.Effect<SplitResult, never>;
    swap: (
      nodeId: Id.Node,
      direction: "up" | "down",
    ) => Effect.Effect<boolean, never>;
    moveToFirst: (nodeId: Id.Node) => Effect.Effect<boolean, never>;
    moveToLast: (nodeId: Id.Node) => Effect.Effect<boolean, never>;
  }
>() {}

export const BlockLive = Layer.effect(
  BlockT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Window = yield* WindowT;
    const Yjs = yield* YjsT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(WindowT, Window),
      Context.add(YjsT, Yjs),
    );

    return {
      subscribe: withContext(subscribe)(context),
      attestExistence: withContext(attestExistence)(context),
      setExpanded: (blockId: Id.Block, isExpanded: boolean) =>
        Store.setDocument("block", { isExpanded }, blockId).pipe(
          Effect.catchAll(() => Effect.void),
        ),
      isExpanded: (blockId: Id.Block) =>
        Store.getDocument("block", blockId).pipe(
          Effect.map((doc) => Option.isNone(doc) || doc.value.isExpanded),
        ),

      // Tree navigation
      findDeepestLastChild: withContext(findDeepestLastChild)(context),
      findNextNode: withContext(findNextNode)(context),
      findNextNodeInDocumentOrder: withContext(findNextNodeInDocumentOrder)(context),
      findPreviousNode: withContext(findPreviousNode)(context),

      // Structural operations
      split: withContext(split)(context),
      swap: withContext(swap)(context),
      moveToFirst: withContext(moveToFirst)(context),
      moveToLast: withContext(moveToLast)(context),
    };
  }),
);
