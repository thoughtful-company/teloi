import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";

export type MoveNodesArgs = {
  nodeIds: readonly Id.Node[];
  parentId: Id.Node;
  insert: "before" | "after";
  siblingId: Id.Node;
};

/**
 * Get the position of a sibling node, validating it belongs to the expected parent.
 * Returns null if sibling is not under the specified parent.
 */
const getSiblingPosition = (siblingId: Id.Node, parentId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const link = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ childId: siblingId, parentId })
        .first({ fallback: () => null }),
    );
    return link?.position ?? null;
  });

/**
 * Get the next sibling's position (the one after a given position)
 */
const getNextSiblingPosition = (parentId: Id.Node, afterPosition: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const nextSibling = yield* Store.query(
      tables.parentLinks
        .select()
        .where({
          parentId,
          position: { op: ">", value: afterPosition },
        })
        .orderBy("position", "asc")
        .first({ fallback: () => null }),
    );
    return nextSibling?.position ?? null;
  });

/**
 * Get the previous sibling's position (the one before a given position)
 */
const getPrevSiblingPosition = (parentId: Id.Node, beforePosition: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const prevSibling = yield* Store.query(
      tables.parentLinks
        .select()
        .where({
          parentId,
          position: { op: "<", value: beforePosition },
        })
        .orderBy("position", "desc")
        .first({ fallback: () => null }),
    );
    return prevSibling?.position ?? null;
  });

/**
 * Moves multiple nodes in a single atomic operation.
 * All nodes are moved relative to the same sibling, maintaining their relative order.
 */
export const moveNodes = (args: MoveNodesArgs) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const { nodeIds, parentId, insert, siblingId } = args;

    if (nodeIds.length === 0) return;

    // Validate sibling belongs to specified parent
    const siblingPos = yield* getSiblingPosition(siblingId, parentId);
    if (siblingPos === null) {
      yield* Effect.logError("[Node.moveNodes] Sibling not under specified parent, aborting").pipe(
        Effect.annotateLogs({ siblingId, parentId, nodeIds: nodeIds.join(",") }),
      );
      return;
    }

    const moves: Array<{ nodeId: string; newParentId: string; position: string }> = [];

    if (insert === "before") {
      // For "before": process in forward order
      // Each node slots between the previous insertion and the sibling
      let prevPos = yield* getPrevSiblingPosition(parentId, siblingPos);

      for (const nodeId of nodeIds) {
        const position = generateKeyBetween(prevPos, siblingPos);
        moves.push({
          nodeId,
          newParentId: parentId,
          position,
        });
        // Next node will be inserted after this one
        prevPos = position;
      }
    } else {
      // For "after": process in reverse order
      // Each node slots between the sibling and the next position
      let nextPos = yield* getNextSiblingPosition(parentId, siblingPos);

      for (let i = nodeIds.length - 1; i >= 0; i--) {
        const nodeId = nodeIds[i]!;
        const position = generateKeyBetween(siblingPos, nextPos);
        moves.push({
          nodeId,
          newParentId: parentId,
          position,
        });
        // Next node (processed earlier in array) will slot between sibling and this one
        nextPos = position;
      }

      // Reverse to maintain original order in the event
      moves.reverse();
    }

    // Single commit with all moves
    yield* Store.commit(
      events.nodesReordered({
        timestamp: Date.now(),
        data: { moves },
      }),
    );
  });
