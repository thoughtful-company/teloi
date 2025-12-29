import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";

/**
 * Creates a new root node (top-level page with no parent).
 * The node is positioned after the last existing root node.
 */
export const createRootNode = () =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const nodeId = nanoid() as Id.Node;

    const lastRoot = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ parentId: null })
        .orderBy("position", "desc")
        .first({ fallback: () => null }),
    );

    // Empty string is not a valid fractional index key, treat as null
    const lastPosition = lastRoot?.position || null;
    const position = generateKeyBetween(lastPosition, null);

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId, position },
      }),
    );

    return nodeId;
  });
