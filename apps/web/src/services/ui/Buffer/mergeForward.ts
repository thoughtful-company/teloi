import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { isBlockExpanded } from "@/services/ui/Block/navigation";
import { Effect, Option } from "effect";

/**
 * Merge forward (what happens on Delete at end).
 *
 * Decision tree:
 * - Has VISIBLE children (expanded AND has children)?
 *   - YES: First child has no children? → merge first child
 *   - NO: no-op (would orphan grandchildren)
 * - No visible children (collapsed OR no children)?
 *   - Has next sibling?
 *     - YES: Next sibling has no children? → merge next sibling
 *     - NO: no-op (would orphan nieces/nephews)
 *   - No next sibling: no-op (don't cross hierarchy)
 *
 * Key constraint: Never merge a block that has children (would orphan them).
 */
export const mergeForward = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
): Effect.Effect<
  Option.Option<{ cursorOffset: number }>,
  never,
  NodeT | YjsT | StoreT
> =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const currentYtext = Yjs.getText(nodeId);
    const mergePoint = currentYtext.length;

    const children = yield* Node.getNodeChildren(nodeId);
    const isExpanded = yield* isBlockExpanded(bufferId, nodeId);

    // Path 1: Has VISIBLE children (expanded AND has children)
    if (children.length > 0 && isExpanded) {
      const firstChildId = children[0]!;
      const firstChildChildren = yield* Node.getNodeChildren(firstChildId);

      // Can only merge if first child has no children (would orphan them)
      if (firstChildChildren.length > 0) {
        return Option.none();
      }

      const childYtext = Yjs.getText(firstChildId);

      // Get formatted deltas before modification
      const childDeltas = yield* Yjs.getDeltasWithFormats(
        firstChildId,
        0,
        childYtext.length,
      );

      // Insert with formatting preservation
      yield* Yjs.insertWithFormats(nodeId, mergePoint, childDeltas);
      yield* Node.deleteNode(firstChildId);
      Yjs.deleteText(firstChildId);

      return Option.some({ cursorOffset: mergePoint });
    }

    // Path 2: No visible children (collapsed OR no children)
    // Only look at next SIBLING, not next node in doc order (don't cross hierarchy)
    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.succeed(null as Id.Node | null),
      ),
    );
    if (!parentId) return Option.none();

    const siblings = yield* Node.getNodeChildren(parentId);
    const siblingIndex = siblings.indexOf(nodeId);

    // No next sibling (last child of parent) → no-op
    if (siblingIndex === -1 || siblingIndex === siblings.length - 1) {
      return Option.none();
    }

    const nextSiblingId = siblings[siblingIndex + 1]!;
    const nextSiblingChildren = yield* Node.getNodeChildren(nextSiblingId);

    // Next sibling has children → no-op (would orphan them)
    if (nextSiblingChildren.length > 0) {
      return Option.none();
    }

    const nextYtext = Yjs.getText(nextSiblingId);

    // Get formatted deltas before modification
    const nextDeltas = yield* Yjs.getDeltasWithFormats(
      nextSiblingId,
      0,
      nextYtext.length,
    );

    // Insert with formatting preservation
    yield* Yjs.insertWithFormats(nodeId, mergePoint, nextDeltas);
    yield* Node.deleteNode(nextSiblingId);
    Yjs.deleteText(nextSiblingId);

    return Option.some({ cursorOffset: mergePoint });
  });
