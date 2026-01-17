import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Option } from "effect";
import { getActiveView } from "./getActiveView";
import { getOrCreateView } from "./getOrCreateView";
import { getViewsForPage } from "./getViewsForPage";

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
    getActiveView: (bufferId: Id.Buffer) => Effect.Effect<Option.Option<Id.Node>>;

    /**
     * Get all views for a page.
     * Returns the view node IDs linked via HAS_VIEW tuples.
     */
    getViewsForPage: (pageId: Id.Node) => Effect.Effect<readonly Id.Node[]>;
  }
>() {}

export const ViewLive = Layer.effect(
  ViewT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;

    const context = Context.make(StoreT, Store).pipe(Context.add(TupleT, Tuple));

    return {
      getOrCreateView: withContext(getOrCreateView)(context),
      getActiveView: withContext(getActiveView)(context),
      getViewsForPage: withContext(getViewsForPage)(context),
    };
  }),
);
