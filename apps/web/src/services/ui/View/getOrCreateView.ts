import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { getViewsForPage } from "./getViewsForPage";

/**
 * Get or create a default view for a page.
 * If a view already exists, returns the first one (idempotent).
 * Creates the view as a shadow child with inShadow: true and position: "".
 */
export const getOrCreateView = (pageId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;

    // Check if views already exist
    const existingViews = yield* getViewsForPage(pageId);

    if (existingViews.length > 0) {
      // Return first (default) view
      return existingViews[0]!;
    }

    // Create new view node
    const viewId = Id.Node.make(nanoid());

    // 1. Create the node with parent
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: viewId, parentId: pageId, position: "" },
      }),
    );

    // 2. Move to shadow (inShadow: true, position: "")
    yield* Store.commit(
      events.nodeMoved({
        timestamp: Date.now(),
        data: {
          nodeId: viewId,
          newParentId: pageId,
          position: "",
          inShadow: true,
        },
      }),
    );

    // 3. Create HAS_VIEW tuple linking page to view
    yield* Tuple.create(System.HAS_VIEW, [pageId, viewId]);

    return viewId;
  });
