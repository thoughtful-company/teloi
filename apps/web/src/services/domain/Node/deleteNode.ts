import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/**
 * Deletes a node and all its descendants.
 * Cascades to remove parent_links, node_types, and tuple references.
 */
export const deleteNode = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.commit(
      events.nodeDeleted({
        timestamp: Date.now(),
        data: { nodeId },
      }),
    );
  });
