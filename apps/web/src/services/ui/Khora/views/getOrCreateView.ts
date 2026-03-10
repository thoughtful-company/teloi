import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { getViewsForNode } from "./getViewsForNode";

/**
 * Get or create a default view for a node.
 * If a view already exists, returns the first one (idempotent).
 * Creates the view as a shadow child with inShadow: true and position: "".
 */
export const getOrCreateView = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;

    // Check if views already exist
    const existingViews = yield* getViewsForNode(nodeId);

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
        data: { nodeId: viewId, parentId: nodeId, position: "" },
      }),
    );

    // 2. Move to shadow (inShadow: true, position: "")
    yield* Store.commit(
      events.nodeMoved({
        timestamp: Date.now(),
        data: {
          nodeId: viewId,
          newParentId: nodeId,
          position: "",
          inShadow: true,
        },
      }),
    );

    // 3. Create HAS_VIEW tuple linking node to view
    yield* Tuple.create(System.HAS_VIEW, [nodeId, viewId]);

    return viewId;
  });
