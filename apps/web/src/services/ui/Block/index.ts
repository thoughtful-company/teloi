import { Id } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { TupleT, TupleNotFoundError } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PickerT } from "@/services/ui/Picker";
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
import {
  findDeepestLastChild,
  findNextNode,
  findNextNodeInDocumentOrder,
  findPreviousNode,
} from "@/services/ui/Buffer/navigation";
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
      | NodeNotFoundError
      | Id.InvalidBlockIdError
      | VirtualBlockError
      | TupleNotFoundError
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

    // Expand/collapse
    expandOneLevel: (
      bufferId: Id.Buffer,
      nodeId: Id.Node,
    ) => Effect.Effect<boolean, never>;
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

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(TupleT, Tuple),
      Context.add(WindowT, Window),
      Context.add(AutomergeT, Automerge),
      Context.add(TypeT, Type),
      Context.add(PickerT, Picker),
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
      findNextNodeInDocumentOrder: withContext(findNextNodeInDocumentOrder)(
        context,
      ),
      findPreviousNode: withContext(findPreviousNode)(context),

      // Expand/collapse
      expandOneLevel: withContext(expandOneLevel)(context),
    };
  }),
);
