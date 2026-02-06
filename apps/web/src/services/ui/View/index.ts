import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option } from "effect";
import * as ChatNav from "./chat/navigation";
import * as ChatCreate from "./chat/createBlock";
import * as PageNav from "./page/navigation";
import * as PageCreate from "./page/createBlock";
import * as PageStructural from "./page/structural";
import { resolveViewType } from "./internal/resolveViewType";

export type { MergeResult } from "./page/structural";

// Re-export view types from Block for backward compatibility
export type { ViewInfo, ViewType } from "@/services/ui/Block";
export { resolveActiveViewType } from "@/services/ui/Block";

/**
 * ViewT — Ghost-aware structural operations for block navigation and mutation.
 *
 * All methods take Id.Block (which encapsulates frameId + nodeId) and internally
 * dispatch to the appropriate view-specific implementation (page vs chat).
 *
 * Ghost handling:
 * - Navigation queries check ghostParentId/ghostChildId fields
 * - Mutations auto-materialize ghosts before structural changes
 */
export class ViewT extends Context.Tag("ViewT")<
  ViewT,
  {
    /** Find the block visually above (page: previous in tree, chat: previous in tuple order) */
    resolveBlockAbove: (
      blockId: Id.Block,
    ) => Effect.Effect<Option.Option<Id.Block>>;

    /** Find the block visually below (page: next in tree, chat: next in tuple order) */
    resolveBlockBelow: (
      blockId: Id.Block,
    ) => Effect.Effect<Option.Option<Id.Block>>;

    /** Find the block to the left (page: same as above, chat: none) */
    resolveBlockLeft: (
      blockId: Id.Block,
    ) => Effect.Effect<Option.Option<Id.Block>>;

    /** Find the block to the right (page: same as below, chat: none) */
    resolveBlockRight: (
      blockId: Id.Block,
    ) => Effect.Effect<Option.Option<Id.Block>>;

    /** Create a new block before/after the given block */
    createBlock: (
      blockId: Id.Block,
      position: "before" | "after",
    ) => Effect.Effect<Id.Block>;

    /** Get parent block (ghost-aware: checks ghostParentId first) */
    getParent: (blockId: Id.Block) => Effect.Effect<Option.Option<Id.Block>>;

    /** Get children blocks (ghost-aware: includes ghostChildId if present) */
    getChildren: (blockId: Id.Block) => Effect.Effect<readonly Id.Block[]>;

    /** Swap block with sibling (ghost-aware: materializes first) */
    swap: (
      blockId: Id.Block,
      direction: "up" | "down",
    ) => Effect.Effect<boolean>;

    /** Move block to first sibling position (ghost-aware: materializes first) */
    moveToFirst: (blockId: Id.Block) => Effect.Effect<boolean>;

    /** Move block to last sibling position (ghost-aware: materializes first) */
    moveToLast: (blockId: Id.Block) => Effect.Effect<boolean>;

    /** Force delete block and descendants (ghost-aware: handles ghost cleanup) */
    forceDelete: (
      blockId: Id.Block,
    ) => Effect.Effect<Option.Option<PageStructural.MergeResult>>;
  }
>() {}

export const ViewLive = Layer.effect(
  ViewT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Automerge = yield* AutomergeT;

    const pageContext = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
    );

    const pageStructuralContext = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(AutomergeT, Automerge),
    );

    const chatContext = Context.make(StoreT, Store).pipe(
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
    );

    const viewTypeContext = Context.make(StoreT, Store).pipe(
      Context.add(TypeT, Type),
    );

    const getViewType = withContext(resolveViewType)(viewTypeContext);

    const wrapNodeResult = (
      blockId: Id.Block,
      nodeOpt: Option.Option<Id.Node>,
    ): Option.Option<Id.Block> => {
      if (Option.isNone(nodeOpt)) return Option.none();
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return Option.none();
      return Option.some(Id.makeFrameBlockId(ctx.frameId, nodeOpt.value));
    };

    const resolveBlockAbove = Effect.fn("View.resolveBlockAbove")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return Option.none<Id.Block>();

      const viewType = yield* getViewType(blockId);

      const nodeOpt: Option.Option<Id.Node> =
        viewType === "chat"
          ? yield* ChatNav.findPreviousNode(ctx.nodeId, ctx.frameId).pipe(
              Effect.provide(chatContext),
            )
          : yield* PageNav.findPreviousNode(ctx.nodeId, ctx.frameId).pipe(
              Effect.provide(pageContext),
            );

      return wrapNodeResult(blockId, nodeOpt);
    });

    const resolveBlockBelow = Effect.fn("View.resolveBlockBelow")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return Option.none<Id.Block>();

      const viewType = yield* getViewType(blockId);

      const nodeOpt: Option.Option<Id.Node> =
        viewType === "chat"
          ? yield* ChatNav.findNextNode(ctx.nodeId, ctx.frameId).pipe(
              Effect.provide(chatContext),
            )
          : yield* PageNav.findNextNodeInDocumentOrder(
              ctx.nodeId,
              ctx.frameId,
            ).pipe(Effect.provide(pageContext));

      return wrapNodeResult(blockId, nodeOpt);
    });

    const resolveBlockLeft = Effect.fn("View.resolveBlockLeft")(function* (
      blockId: Id.Block,
    ) {
      const viewType = yield* getViewType(blockId);

      // Chat view: no left/right navigation
      if (viewType === "chat") return Option.none<Id.Block>();

      // Page view: left is same as up
      return yield* resolveBlockAbove(blockId);
    });

    const resolveBlockRight = Effect.fn("View.resolveBlockRight")(function* (
      blockId: Id.Block,
    ) {
      const viewType = yield* getViewType(blockId);

      // Chat view: no left/right navigation
      if (viewType === "chat") return Option.none<Id.Block>();

      // Page view: right is same as down
      return yield* resolveBlockBelow(blockId);
    });

    const createBlock = Effect.fn("View.createBlock")(function* (
      blockId: Id.Block,
      position: "before" | "after",
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") {
        return yield* Effect.die(
          new Error("createBlock requires a frame block"),
        );
      }

      const viewType = yield* getViewType(blockId);

      const newNodeId =
        viewType === "chat"
          ? yield* ChatCreate.createBlock(
              ctx.nodeId,
              ctx.frameId,
              position,
            ).pipe(Effect.provide(chatContext), Effect.orDie)
          : yield* PageCreate.createBlock(
              ctx.nodeId,
              ctx.frameId,
              position,
            ).pipe(Effect.provide(pageContext), Effect.orDie);

      return Id.makeFrameBlockId(ctx.frameId, newNodeId);
    });

    const getParent = Effect.fn("View.getParent")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return Option.none<Id.Block>();

      const nodeOpt = yield* PageStructural.getParent(
        ctx.nodeId,
        ctx.frameId,
      ).pipe(Effect.provide(pageContext));

      return wrapNodeResult(blockId, nodeOpt);
    });

    const getChildren = Effect.fn("View.getChildren")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return [] as readonly Id.Block[];

      const children = yield* PageStructural.getChildren(
        ctx.nodeId,
        ctx.frameId,
      ).pipe(Effect.provide(pageContext));

      return children.map((nodeId) => Id.makeFrameBlockId(ctx.frameId, nodeId));
    });

    const swap = Effect.fn("View.swap")(function* (
      blockId: Id.Block,
      direction: "up" | "down",
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return false;

      return yield* PageStructural.swap(
        ctx.nodeId,
        ctx.frameId,
        direction,
      ).pipe(
        Effect.provide(pageStructuralContext),
        Effect.catchAll(() => Effect.succeed(false)),
      );
    });

    const moveToFirst = Effect.fn("View.moveToFirst")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return false;

      return yield* PageStructural.moveToFirst(ctx.nodeId, ctx.frameId).pipe(
        Effect.provide(pageStructuralContext),
        Effect.catchAll(() => Effect.succeed(false)),
      );
    });

    const moveToLast = Effect.fn("View.moveToLast")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame") return false;

      return yield* PageStructural.moveToLast(ctx.nodeId, ctx.frameId).pipe(
        Effect.provide(pageStructuralContext),
        Effect.catchAll(() => Effect.succeed(false)),
      );
    });

    const forceDelete = Effect.fn("View.forceDelete")(function* (
      blockId: Id.Block,
    ) {
      const ctx = Id.parseBlockContextSync(blockId);
      if (ctx.type !== "frame")
        return Option.none<PageStructural.MergeResult>();

      return yield* PageStructural.forceDelete(ctx.nodeId, ctx.frameId).pipe(
        Effect.provide(pageStructuralContext),
      );
    });

    return {
      resolveBlockAbove,
      resolveBlockBelow,
      resolveBlockLeft,
      resolveBlockRight,
      createBlock,
      getParent,
      getChildren,
      swap,
      moveToFirst,
      moveToLast,
      forceDelete,
    };
  }),
);
