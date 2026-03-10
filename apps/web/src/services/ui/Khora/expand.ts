import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { nanoid } from "nanoid";
import { Effect } from "effect";
import { getKhoraDoc } from "./getKhoraDoc";

export interface ExpandResult {
  readonly expanded: boolean;
  readonly ghostNodeId: Id.Node | null;
}

/**
 * Recursively expand nodes level-by-level using DFS order.
 *
 * When invoked on a node:
 * 1. If the node's block is collapsed, expand it and return true
 *    - If the node has no children, a ghost block is created
 * 2. If already expanded, check children (in order) for the first collapsed descendant
 * 3. Expand the first collapsed node found and return true
 * 4. If expanded with no children and no ghost, create a ghost and return true
 * 5. If everything is already expanded, return false
 *
 * Used for keyboard shortcuts that progressively reveal a tree (Cmd+Down on a block).
 */
export const expandOneLevel = (
  frameId: Id.Frame,
  nodeId: Id.Node,
): Effect.Effect<ExpandResult, never, StoreT | NodeT | AutomergeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;

    const expand = (
      nId: Id.Node,
    ): Effect.Effect<ExpandResult, never, StoreT | NodeT | AutomergeT> =>
      Effect.gen(function* () {
        const blockDoc = yield* getKhoraDoc(frameId, nId);

        if (!blockDoc.isExpanded) {
          const khoraId = Id.makeFrameKhoraId(frameId, nId);
          const children = yield* Node.getNodeChildren(nId);

          if (children.length === 0) {
            const ghostNodeId = yield* createGhost(
              Store,
              Automerge,
              frameId,
              nId,
              khoraId,
            );
            return { expanded: true, ghostNodeId };
          } else {
            yield* Store.setDocument(
              "khora",
              { ...blockDoc, isExpanded: true },
              khoraId,
            ).pipe(Effect.catchAll(() => Effect.void));
          }

          return { expanded: true, ghostNodeId: null };
        }

        // Already expanded — try children in order (DFS)
        const children = yield* Node.getNodeChildren(nId);
        for (const childId of children) {
          const result = yield* expand(childId);
          if (result.expanded) return result;
        }

        // Expanded, no children, no ghost yet — create one
        if (children.length === 0 && !blockDoc.ghostChildId) {
          const khoraId = Id.makeFrameKhoraId(frameId, nId);
          const ghostNodeId = yield* createGhost(
            Store,
            Automerge,
            frameId,
            nId,
            khoraId,
          );
          return { expanded: true, ghostNodeId };
        }

        return { expanded: false, ghostNodeId: null };
      });

    return yield* expand(nodeId);
  });

// ================================ Internal ==================================

const createGhost = (
  Store: StoreT["Type"],
  Automerge: AutomergeT["Type"],
  frameId: Id.Frame,
  parentNodeId: Id.Node,
  parentBlockId: Id.Khora,
): Effect.Effect<Id.Node> =>
  Effect.gen(function* () {
    const ghostChildId = Id.Node.make(nanoid());

    yield* Store.setDocument(
      "khora",
      {
        isExpanded: true,
        activeViewId: null,
        ghostChildId,
        ghostParentId: null,
      },
      parentBlockId,
    ).pipe(Effect.catchAll(() => Effect.void));

    const ghostBlockId = Id.makeFrameKhoraId(frameId, ghostChildId);
    yield* Store.setDocument(
      "khora",
      {
        isExpanded: false,
        activeViewId: null,
        ghostChildId: null,
        ghostParentId: parentNodeId,
      },
      ghostBlockId,
    ).pipe(Effect.catchAll(() => Effect.void));

    yield* Automerge.setText(ghostChildId, "");

    return ghostChildId;
  });
