import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";

/**
 * Gets all direct children of the specified node.
 * Returns child node IDs in order by position.
 */
export const getNodeChildren = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    // When selecting a single column, LiveStore returns an array of values
    const childIds = yield* Store.query(
      tables.parentLinks
        .select("childId")
        .where("parentId", "=", nodeId)
        .orderBy("position", "asc"),
    );

    return childIds as readonly Id.Node[];
  });
