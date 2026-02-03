import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { getActiveView } from "./getActiveView";
import { getOrCreateView } from "./getOrCreateView";
import { getViewsForPage } from "./getViewsForPage";
import { subscribeViewInfo } from "./subscribeViewInfo";
import { subscribeViewsForPage } from "./subscribeViewsForPage";
import type { ViewInfo } from "./types";

export type { ViewInfo, ViewType } from "./types";
export { resolveActiveViewType, resolveViewType } from "./types";

/**
 * ViewT service manages view nodes for pages.
 *
 * Views are shadow children of pages that define alternate rendering modes
 * (e.g., table view, board view). They are linked via HAS_VIEW tuples.
 */
export class ViewT extends Context.Tag("ViewT")<
  ViewT,
  {
    /**
     * Get or create a view for a page.
     * If a view already exists, returns it (idempotent).
     * Creates the view as a shadow child with inShadow: true and position: "".
     */
    getOrCreateView: (pageId: Id.Node) => Effect.Effect<Id.Node>;

    /**
     * Get the active view for a buffer.
     * Returns Option.none() if no activeViewId is set.
     */
    getActiveView: (
      bufferId: Id.Buffer,
    ) => Effect.Effect<Option.Option<Id.Node>>;

    /**
     * Get all views for a page.
     * Returns the view node IDs linked via HAS_VIEW tuples.
     */
    getViewsForPage: (pageId: Id.Node) => Effect.Effect<readonly Id.Node[]>;

    /**
     * Subscribe to views for a page.
     * Emits whenever HAS_VIEW tuples change for the given page.
     */
    subscribeViewsForPage: (
      pageId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly Id.Node[]>>;

    /**
     * Subscribe to resolved view info for a page.
     * Emits ViewInfo[] with id, name, and resolved type for each view.
     */
    subscribeViewInfo: (
      pageId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly ViewInfo[]>>;
  }
>() {}

export const ViewLive = Layer.effect(
  ViewT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
    );

    return {
      getOrCreateView: withContext(getOrCreateView)(context),
      getActiveView: withContext(getActiveView)(context),
      getViewsForPage: withContext(getViewsForPage)(context),
      subscribeViewsForPage: withContext(subscribeViewsForPage)(context),
      subscribeViewInfo: withContext(subscribeViewInfo)(context),
    };
  }),
);
