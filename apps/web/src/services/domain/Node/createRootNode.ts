import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";

/**
 * Creates a new user page as a child of the workspace node.
 * The node is positioned after the last existing workspace child.
 */
export const createRootNode = () =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const nodeId = nanoid() as Id.Node;

    const lastChild = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ parentId: System.WORKSPACE })
        .orderBy("position", "desc")
        .first({ fallback: () => null }),
    );

    // Empty string is not a valid fractional index key, treat as null
    const lastPosition = lastChild?.position || null;
    const position = generateKeyBetween(lastPosition, null);

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId, parentId: System.WORKSPACE, position },
      }),
    );

    return nodeId;
  });
