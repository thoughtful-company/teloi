import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { Effect } from "effect";

export interface SplitParams {
  nodeId: Id.Node;
  cursorPos: number;
  textAfter: string;
}

export interface SplitResult {
  newNodeId: Id.Node;
  cursorOffset: number;
}

/**
 * Split a node at the cursor position, creating a new sibling node.
 *
 * - If cursor is at start with text after: creates empty node before, keeps current text
 * - Otherwise: current keeps text before cursor, new node gets text after
 *
 * Returns the new node ID and cursor offset (always 0 for new node).
 */
export const split = (
  params: SplitParams,
): Effect.Effect<SplitResult, never, NodeT | YjsT> =>
  Effect.gen(function* () {
    const { nodeId, cursorPos, textAfter } = params;
    const Node = yield* NodeT;
    const Yjs = yield* YjsT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.fail(new CannotSplitRootNodeError()),
      ),
    );

    const isAtStart = cursorPos === 0 && textAfter.length > 0;

    // Create new node as sibling
    const newNodeId = yield* Node.insertNode({
      parentId,
      insert: isAtStart ? "before" : "after",
      siblingId: nodeId,
    });

    // Update Y.Text content for split, preserving formatting
    if (!isAtStart) {
      // Normal case: current block keeps text before cursor, new block gets text after
      const ytext = Yjs.getText(nodeId);
      const deleteLength = ytext.length - cursorPos;

      // Get formatted deltas for the text we're moving BEFORE deleting
      const deltas = yield* Yjs.getDeltasWithFormats(
        nodeId,
        cursorPos,
        deleteLength,
      );

      // Delete from original
      ytext.delete(cursorPos, deleteLength);

      // Insert with formatting into new node
      yield* Yjs.insertWithFormats(newNodeId, 0, deltas);
    }
    // If at start: new block is empty, current block keeps content - no Y.Text changes needed

    return {
      newNodeId,
      cursorOffset: 0,
    };
  }).pipe(
    Effect.catchTag("CannotSplitRootNodeError", () =>
      Effect.succeed(null as SplitResult | null),
    ),
    // Catch NodeInsertError and other node errors - fail silently
    Effect.catchAll(() => Effect.succeed(null as SplitResult | null)),
    Effect.map(
      (result) =>
        result ?? { newNodeId: params.nodeId, cursorOffset: params.cursorPos },
    ),
  );

class CannotSplitRootNodeError {
  readonly _tag = "CannotSplitRootNodeError";
}
