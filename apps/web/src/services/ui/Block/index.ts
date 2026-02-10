import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PickerT } from "@/services/ui/Picker";
import { WorldT } from "@/services/ui/World";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { attestExistence } from "./attestExistence";
import {
  BlockGoneError,
  BlockNotFoundError,
  VirtualBlockError,
} from "./errors";
import { expandOneLevel, type ExpandResult } from "./expand";
import { materialize, type MaterializeParams } from "./materialize";
import {
  findDeepestLastChild,
  findNextNode,
  findNextNodeInDocumentOrder,
  findPreviousNode,
} from "@/services/ui/View/page/navigation";
import { getBlockDoc } from "./getBlockDoc";
import { isBlockExpanded } from "./isBlockExpanded";
import { BlockView, subscribe } from "./subscribe";
import {
  getActiveView,
  getOrCreateView,
  getViewsForNode,
  subscribeViewInfo,
  subscribeViewsForNode,
  type ViewInfo,
} from "./views";

export {
  BlockGoneError,
  BlockNotFoundError,
  VirtualBlockError,
} from "./errors";
export type { BlockView } from "./subscribe";
export type { MaterializeParams } from "./materialize";
export {
  resolveActiveViewType,
  resolveViewType,
  type ViewInfo,
  type ViewType,
} from "./views";

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
    get: (frameId: Id.Frame, nodeId: Id.Node) => Effect.Effect<Model.Block>;
    setExpanded: (
      blockId: Id.Block,
      isExpanded: boolean,
    ) => Effect.Effect<void, never>;
    isExpanded: (blockId: Id.Block) => Effect.Effect<boolean, never>;
    isBlockExpanded: (
      frameId: Id.Frame,
      nodeId: Id.Node,
    ) => Effect.Effect<boolean, never>;

    // Tree navigation
    findDeepestLastChild: (
      startNodeId: Id.Node,
      frameId: Id.Frame,
    ) => Effect.Effect<Id.Node, never>;
    findNextNode: (
      currentId: Id.Node,
      frameId: Id.Frame,
    ) => Effect.Effect<Option.Option<Id.Node>, never>;
    findNextNodeInDocumentOrder: (
      currentId: Id.Node,
      frameId: Id.Frame,
    ) => Effect.Effect<Option.Option<Id.Node>, never>;
    findPreviousNode: (
      currentId: Id.Node,
      frameId: Id.Frame,
    ) => Effect.Effect<Option.Option<Id.Node>, never>;

    // Expand/collapse
    expandOneLevel: (
      frameId: Id.Frame,
      nodeId: Id.Node,
    ) => Effect.Effect<ExpandResult, never>;

    materialize: (params: MaterializeParams) => Effect.Effect<void, never>;

    // View entity management
    setActiveView: (
      blockId: Id.Block,
      viewId: Id.Node | null,
    ) => Effect.Effect<void, never>;
    getActiveView: (frameId: Id.Frame) => Effect.Effect<Option.Option<Id.Node>>;
    getViewsForNode: (nodeId: Id.Node) => Effect.Effect<readonly Id.Node[]>;
    getOrCreateView: (nodeId: Id.Node) => Effect.Effect<Id.Node>;
    subscribeViewsForNode: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly Id.Node[]>>;
    subscribeViewInfo: (
      nodeId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly ViewInfo[]>>;
  }
>() {}

export const BlockLive = Layer.effect(
  BlockT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const World = yield* WorldT;
    const Automerge = yield* AutomergeT;
    const Type = yield* TypeT;
    const Picker = yield* PickerT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(TupleT, Tuple),
      Context.add(WorldT, World),
      Context.add(AutomergeT, Automerge),
      Context.add(TypeT, Type),
      Context.add(PickerT, Picker),
    );

    return {
      subscribe: withContext(subscribe)(context),
      attestExistence: withContext(attestExistence)(context),
      get: withContext(getBlockDoc)(context),
      setExpanded: (blockId: Id.Block, isExpanded: boolean) =>
        Store.getDocument("block", blockId).pipe(
          Effect.flatMap((doc) => {
            const current = Option.getOrElse(doc, () => ({
              isExpanded: true,
              activeViewId: null,
              ghostChildId: null as Id.Node | null,
              ghostParentId: null as Id.Node | null,
              selection: null,
            }));

            // When collapsing a block with a ghost, clean up the ghost
            if (!isExpanded && current.ghostChildId) {
              const ctx = Id.parseBlockContextSync(blockId);
              if (ctx.type === "frame") {
                const ghostBlockId = Id.makeFrameBlockId(
                  ctx.frameId,
                  current.ghostChildId,
                );
                return Effect.all([
                  // Delete ghost's Automerge text
                  Automerge.deleteText(current.ghostChildId).pipe(
                    Effect.catchAll(() => Effect.void),
                  ),
                  // Clear ghost's block doc
                  Store.setDocument(
                    "block",
                    {
                      isExpanded: false,
                      activeViewId: null,
                      ghostChildId: null,
                      ghostParentId: null,
                      selection: null,
                    },
                    ghostBlockId,
                  ).pipe(Effect.catchAll(() => Effect.void)),
                  // Collapse parent and clear ghostChildId
                  Store.setDocument(
                    "block",
                    { ...current, isExpanded: false, ghostChildId: null },
                    blockId,
                  ),
                ]).pipe(Effect.asVoid);
              }
            }

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
      materialize: withContext(materialize)(context),

      // View entity management
      setActiveView: (blockId: Id.Block, viewId: Id.Node | null) =>
        Store.getDocument("block", blockId).pipe(
          Effect.flatMap((doc) => {
            const current = Option.getOrElse(doc, () => ({
              isExpanded: true,
              activeViewId: null,
              ghostChildId: null,
              ghostParentId: null,
              selection: null,
            }));
            return Store.setDocument(
              "block",
              { ...current, activeViewId: viewId },
              blockId,
            );
          }),
          Effect.catchAll(() => Effect.void),
        ),
      getActiveView: withContext(getActiveView)(context),
      getViewsForNode: withContext(getViewsForNode)(context),
      getOrCreateView: withContext(getOrCreateView)(context),
      subscribeViewsForNode: withContext(subscribeViewsForNode)(context),
      subscribeViewInfo: withContext(subscribeViewInfo)(context),
    };
  }),
);
