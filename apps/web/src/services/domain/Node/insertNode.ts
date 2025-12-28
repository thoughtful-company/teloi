import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import { NodeInsertError, NodeNotFoundError } from "../errors";

export type InsertNodeArgs = {
  nodeId?: Id.Node;
  parentId: Id.Node;
  insert: "before" | "after";
  siblingId?: Id.Node;
};

/**
 * Get the position of a sibling node
 */
const getSiblingPosition = (siblingId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const link = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ childId: siblingId })
        .first({ fallback: () => null }),
    );
    if (!link) {
      return yield* Effect.fail(new NodeNotFoundError({ nodeId: siblingId }));
    }
    return link.position;
  });

/**
 * Get the last child's position for a parent (for "after" with no sibling)
 */
const getLastChildPosition = (parentId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const lastChild = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ parentId })
        .orderBy("position", "desc")
        .first({ fallback: () => null }),
    );
    return lastChild?.position ?? null;
  });

/**
 * Get the first child's position for a parent (for "before" with no sibling)
 */
const getFirstChildPosition = (parentId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const firstChild = yield* Store.query(
      tables.parentLinks
        .select()
        .where({ parentId })
        .orderBy("position", "asc")
        .first({ fallback: () => null }),
    );
    return firstChild?.position ?? null;
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
 * Resolve the fractional index position for insertion
 */
const resolvePosition = (
  parentId: Id.Node,
  insert: "before" | "after",
  siblingId: Id.Node | undefined,
) =>
  Effect.gen(function* () {
    if (!siblingId) {
      // No sibling specified - insert at start or end
      if (insert === "after") {
        const lastPos = yield* getLastChildPosition(parentId);
        return generateKeyBetween(lastPos, null);
      } else {
        const firstPos = yield* getFirstChildPosition(parentId);
        return generateKeyBetween(null, firstPos);
      }
    }

    // Insert relative to a specific sibling
    const siblingPos = yield* getSiblingPosition(siblingId);

    if (insert === "after") {
      const nextPos = yield* getNextSiblingPosition(parentId, siblingPos);
      return generateKeyBetween(siblingPos, nextPos);
    } else {
      const prevPos = yield* getPrevSiblingPosition(parentId, siblingPos);
      return generateKeyBetween(prevPos, siblingPos);
    }
  });

/**
 * Check if a node exists
 */
const nodeExists = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const node = yield* Store.query(
      tables.nodes.select().where({ id: nodeId }).first({ fallback: () => null }),
    );
    return node !== null;
  });

/**
 * Inserts a new node or moves an existing node in the tree structure.
 * If nodeId exists, the node is moved; otherwise, a new node is created.
 */
export const insertNode = (args: InsertNodeArgs) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const { parentId, insert, siblingId } = args;
    const nodeId = args.nodeId ?? (nanoid() as Id.Node);

    // Resolve the position for insertion
    const position = yield* resolvePosition(parentId, insert, siblingId);

    // Check if node already exists (move vs create)
    const exists = yield* nodeExists(nodeId);

    if (exists) {
      // Move existing node
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId,
            newParentId: parentId,
            position,
            isHidden: false,
          },
        }),
      );
    } else {
      // Create new node
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: {
            nodeId,
            parentId,
            position,
          },
        }),
      );
    }

    return nodeId;
  }).pipe(
    Effect.catchAllDefect(() =>
      Effect.fail(
        new NodeInsertError({
          nodeId: args.nodeId ?? ("unknown" as Id.Node),
        }),
      ),
    ),
  );
