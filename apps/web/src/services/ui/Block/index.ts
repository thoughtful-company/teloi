import { Id } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PickerT } from "@/services/ui/Picker";
import { ViewT } from "@/services/ui/View";
import { WindowT } from "@/services/ui/Window";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { attestExistence } from "./attestExistence";
import {
  BlockGoneError,
  BlockNotFoundError,
  VirtualBlockError,
} from "./errors";
import { expandOneLevel } from "./expand";
import { findDeepestLastChild } from "@/services/ui/ViewNavigation/page/findDeepestLastChild";
import { findNextNode } from "@/services/ui/ViewNavigation/page/findNextNode";
import { findNextNodeInDocumentOrder } from "@/services/ui/ViewNavigation/page/findNextNodeInDocumentOrder";
import { findPreviousNode } from "@/services/ui/ViewNavigation/page/findPreviousNode";
import { isBlockExpanded } from "./isBlockExpanded";
import { BlockView, subscribe } from "./subscribe";

export {
  BlockGoneError,
  BlockNotFoundError,
  VirtualBlockError,
} from "./errors";
export type { BlockView } from "./subscribe";

export class BlockT extends Context.Tag("BlockT")<
  BlockT,
  {
    subscribe: (
      blockId: Id.Block,
    ) => Effect.Effect<
      Stream.Stream<BlockView, BlockGoneError>,
      | BlockNotFoundError
      | BlockGoneError
      | NodeNotFoundError
      | Id.InvalidBlockIdError
      | VirtualBlockError
    >;
    attestExistence: (
      blockId: Id.Block,
    ) => Effect.Effect<void, BlockNotFoundError>;
    setExpanded: (
      blockId: Id.Block,
      isExpanded: boolean,
    ) => Effect.Effect<void, never>;
    isExpanded: (blockId: Id.Block) => Effect.Effect<boolean, never>;
    isBlockExpanded: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<boolean, never>;

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

    // Expand/collapse
    expandOneLevel: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<boolean, never>;

    // View
    setActiveView: (
      blockId: Id.Block,
      viewId: Id.Node | null,
    ) => Effect.Effect<void, never>;
  }
>() {}

export const BlockLive = Layer.effect(
  BlockT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Window = yield* WindowT;
    const Automerge = yield* AutomergeT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;
    const View = yield* ViewT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(TupleT, Tuple),
      Context.add(WindowT, Window),
      Context.add(AutomergeT, Automerge),
      Context.add(TypeT, Type),
      Context.add(PickerT, Picker),
      Context.add(ViewT, View),
    );

    return {
      subscribe: withContext(subscribe)(context),
      attestExistence: withContext(attestExistence)(context),
      setExpanded: (blockId: Id.Block, isExpanded: boolean) =>
        Store.getDocument("block", blockId).pipe(
          Effect.flatMap((doc) => {
            const current = Option.getOrElse(doc, () => ({
              isExpanded: true,
              activeViewId: null,
            }));
            return Store.setDocument(
              "block",
              { ...current, isExpanded },
              blockId,
            );
          }),
          Effect.catchAll(() => Effect.void),
        ),
      isExpanded: (blockId: Id.Block) =>
        Store.getDocument("block", blockId).pipe(
          Effect.map((doc) => Option.isNone(doc) || doc.value.isExpanded),
        ),

      isBlockExpanded: withContext(isBlockExpanded)(context),

      // Tree navigation
      findDeepestLastChild: withContext(findDeepestLastChild)(context),
      findNextNode: withContext(findNextNode)(context),
      findNextNodeInDocumentOrder: withContext(findNextNodeInDocumentOrder)(
        context,
      ),
      findPreviousNode: withContext(findPreviousNode)(context),

      // Expand/collapse
      expandOneLevel: withContext(expandOneLevel)(context),

      // View
      setActiveView: (blockId: Id.Block, viewId: Id.Node | null) =>
        Store.getDocument("block", blockId).pipe(
          Effect.flatMap((doc) => {
            const current = Option.getOrElse(doc, () => ({
              isExpanded: true,
              activeViewId: null,
            }));
            return Store.setDocument(
              "block",
              { ...current, activeViewId: viewId },
              blockId,
            );
          }),
          Effect.catchAll(() => Effect.void),
        ),
    };
  }),
);
