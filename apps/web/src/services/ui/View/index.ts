import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option } from "effect";
import * as ChatNav from "./chat/navigation";
import * as ChatCreate from "./chat/createKhora";
import * as PageNav from "./page/navigation";
import * as PageCreate from "./page/createKhora";
import * as PageStructural from "./page/structural";
import { getOrCreateView as getOrCreateViewImpl } from "./getOrCreateView";
import { resolveViewType } from "./internal/resolveViewType";

export type { MergeResult } from "./page/structural";

// Re-export view types from Block for backward compatibility
export type { ViewInfo, ViewType } from "@/services/ui/Khora";
export { resolveActiveViewType } from "@/services/ui/Khora";

/**
 * ViewT — Ghost-aware structural operations for block navigation and mutation.
 *
 * All methods take Id.Khora (which encapsulates frameId + nodeId) and internally
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
      khoraId: Id.Khora,
    ) => Effect.Effect<Option.Option<Id.Khora>>;

    /** Find the block visually below (page: next in tree, chat: next in tuple order) */
    resolveBlockBelow: (
      khoraId: Id.Khora,
    ) => Effect.Effect<Option.Option<Id.Khora>>;

    /** Find the block to the left (page: same as above, chat: none) */
    resolveBlockLeft: (
      khoraId: Id.Khora,
    ) => Effect.Effect<Option.Option<Id.Khora>>;

    /** Find the block to the right (page: same as below, chat: none) */
    resolveBlockRight: (
      khoraId: Id.Khora,
    ) => Effect.Effect<Option.Option<Id.Khora>>;

    /** Create a new block before/after the given block */
    createKhora: (
      khoraId: Id.Khora,
      position: "before" | "after",
    ) => Effect.Effect<Id.Khora>;

    /** Get parent block (ghost-aware: checks ghostParentId first) */
    getParent: (khoraId: Id.Khora) => Effect.Effect<Option.Option<Id.Khora>>;

    /** Get children blocks (ghost-aware: includes ghostChildId if present) */
    getChildren: (khoraId: Id.Khora) => Effect.Effect<readonly Id.Khora[]>;

    /** Swap block with sibling (ghost-aware: materializes first) */
    swap: (
      khoraId: Id.Khora,
      direction: "up" | "down",
    ) => Effect.Effect<boolean>;

    /** Move block to first sibling position (ghost-aware: materializes first) */
    moveToFirst: (khoraId: Id.Khora) => Effect.Effect<boolean>;

    /** Move block to last sibling position (ghost-aware: materializes first) */
    moveToLast: (khoraId: Id.Khora) => Effect.Effect<boolean>;

    /** Force delete block and descendants (ghost-aware: handles ghost cleanup) */
    forceDelete: (
      khoraId: Id.Khora,
    ) => Effect.Effect<Option.Option<PageStructural.MergeResult>>;

    /**
     * Get or create the default view for a page.
     * Idempotent: returns the first existing view, or creates a new shadow-child view
     * with a HAS_VIEW tuple linking the page.
     */
    getOrCreateView: (pageId: Id.Node) => Effect.Effect<Id.Node>;
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

    // Every method below short-circuits for non-frame khoras (section,
    // propertyTitle). These are outline-tree operations, and section/
    // propertyTitle khoras simply don't live in the outline — the empty
    // no-op is the semantically correct answer for them, not a bug to be
    // tightened into an exhaustive switch.

    const wrapNodeResult = (
      khoraId: Id.Khora,
      nodeOpt: Option.Option<Id.Node>,
    ): Option.Option<Id.Khora> => {
      if (Option.isNone(nodeOpt)) return Option.none();
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return Option.none();
      return Option.some(Id.makeFrameKhoraId(ctx.frameId, nodeOpt.value));
    };

    const resolveBlockAbove = Effect.fn("View.resolveBlockAbove")(function* (
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return Option.none<Id.Khora>();

      const viewType = yield* getViewType(khoraId);

      const nodeOpt: Option.Option<Id.Node> =
        viewType === "chat"
          ? yield* ChatNav.findPreviousNode(ctx.nodeId, ctx.frameId).pipe(
              Effect.provide(chatContext),
            )
          : yield* PageNav.findPreviousNode(ctx.nodeId, ctx.frameId).pipe(
              Effect.provide(pageContext),
            );

      return wrapNodeResult(khoraId, nodeOpt);
    });

    const resolveBlockBelow = Effect.fn("View.resolveBlockBelow")(function* (
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return Option.none<Id.Khora>();

      const viewType = yield* getViewType(khoraId);

      const nodeOpt: Option.Option<Id.Node> =
        viewType === "chat"
          ? yield* ChatNav.findNextNode(ctx.nodeId, ctx.frameId).pipe(
              Effect.provide(chatContext),
            )
          : yield* PageNav.findNextNodeInDocumentOrder(
              ctx.nodeId,
              ctx.frameId,
            ).pipe(Effect.provide(pageContext));

      return wrapNodeResult(khoraId, nodeOpt);
    });

    const resolveBlockLeft = Effect.fn("View.resolveBlockLeft")(function* (
      khoraId: Id.Khora,
    ) {
      const viewType = yield* getViewType(khoraId);

      // Chat view: no left/right navigation
      if (viewType === "chat") return Option.none<Id.Khora>();

      // Page view: left is same as up
      return yield* resolveBlockAbove(khoraId);
    });

    const resolveBlockRight = Effect.fn("View.resolveBlockRight")(function* (
      khoraId: Id.Khora,
    ) {
      const viewType = yield* getViewType(khoraId);

      // Chat view: no left/right navigation
      if (viewType === "chat") return Option.none<Id.Khora>();

      // Page view: right is same as down
      return yield* resolveBlockBelow(khoraId);
    });

    const createKhora = Effect.fn("View.createKhora")(function* (
      khoraId: Id.Khora,
      position: "before" | "after",
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") {
        return yield* Effect.die(
          new Error("createKhora requires a frame block"),
        );
      }

      const viewType = yield* getViewType(khoraId);

      const newNodeId =
        viewType === "chat"
          ? yield* ChatCreate.createKhora(
              ctx.nodeId,
              ctx.frameId,
              position,
            ).pipe(Effect.provide(chatContext), Effect.orDie)
          : yield* PageCreate.createKhora(
              ctx.nodeId,
              ctx.frameId,
              position,
            ).pipe(Effect.provide(pageContext), Effect.orDie);

      return Id.makeFrameKhoraId(ctx.frameId, newNodeId);
    });

    const getParent = Effect.fn("View.getParent")(function* (
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return Option.none<Id.Khora>();

      const nodeOpt = yield* PageStructural.getParent(
        ctx.nodeId,
        ctx.frameId,
      ).pipe(Effect.provide(pageContext));

      return wrapNodeResult(khoraId, nodeOpt);
    });

    const getChildren = Effect.fn("View.getChildren")(function* (
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return [] as readonly Id.Khora[];

      const children = yield* PageStructural.getChildren(
        ctx.nodeId,
        ctx.frameId,
      ).pipe(Effect.provide(pageContext));

      return children.map((nodeId) => Id.makeFrameKhoraId(ctx.frameId, nodeId));
    });

    const swap = Effect.fn("View.swap")(function* (
      khoraId: Id.Khora,
      direction: "up" | "down",
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
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
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return false;

      return yield* PageStructural.moveToFirst(ctx.nodeId, ctx.frameId).pipe(
        Effect.provide(pageStructuralContext),
        Effect.catchAll(() => Effect.succeed(false)),
      );
    });

    const moveToLast = Effect.fn("View.moveToLast")(function* (
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame") return false;

      return yield* PageStructural.moveToLast(ctx.nodeId, ctx.frameId).pipe(
        Effect.provide(pageStructuralContext),
        Effect.catchAll(() => Effect.succeed(false)),
      );
    });

    const forceDelete = Effect.fn("View.forceDelete")(function* (
      khoraId: Id.Khora,
    ) {
      const ctx = Id.parseKhoraContextSync(khoraId);
      if (ctx.type !== "frame")
        return Option.none<PageStructural.MergeResult>();

      return yield* PageStructural.forceDelete(ctx.nodeId, ctx.frameId).pipe(
        Effect.provide(pageStructuralContext),
      );
    });

    const getOrCreateViewContext = Context.make(StoreT, Store).pipe(
      Context.add(TupleT, Tuple),
    );

    return {
      resolveBlockAbove,
      resolveBlockBelow,
      resolveBlockLeft,
      resolveBlockRight,
      createKhora,
      getParent,
      getChildren,
      swap,
      moveToFirst,
      moveToLast,
      forceDelete,
      getOrCreateView: withContext(getOrCreateViewImpl)(getOrCreateViewContext),
    };
  }),
);
