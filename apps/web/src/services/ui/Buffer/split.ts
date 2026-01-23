import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
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
): Effect.Effect<SplitResult, never, NodeT | AutomergeT> =>
  Effect.gen(function* () {
    const { nodeId, cursorPos, textAfter } = params;
    const Node = yield* NodeT;
    const Automerge = yield* AutomergeT;

    const parentId = yield* Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () =>
        Effect.fail(new CannotSplitRootNodeError()),
      ),
    );

    const isAtStart = cursorPos === 0 && textAfter.length > 0;

    const newNodeId = yield* Node.insertNode({
      parentId,
      insert: isAtStart ? "before" : "after",
      siblingId: nodeId,
    });

    if (!isAtStart) {
      // Get current text
      const currentText = yield* Automerge.getText(nodeId);

      // Keep text before cursor in current node
      const textBefore = currentText.slice(0, cursorPos);
      yield* Automerge.setText(nodeId, textBefore);

      // Put text after cursor in new node
      const textToMove = currentText.slice(cursorPos);
      yield* Automerge.setText(newNodeId, textToMove);
    }

    return {
      newNodeId,
      cursorOffset: 0,
    };
  }).pipe(
    Effect.catchTag("CannotSplitRootNodeError", () =>
      Effect.succeed(null as SplitResult | null),
    ),
    Effect.catchAll((error) =>
      Effect.logError("[Buffer.split] Operation failed").pipe(
        Effect.annotateLogs({ nodeId: params.nodeId, error: String(error) }),
        Effect.as(null as SplitResult | null),
      ),
    ),
    Effect.map(
      (result) =>
        result ?? { newNodeId: params.nodeId, cursorOffset: params.cursorPos },
    ),
  );

class CannotSplitRootNodeError {
  readonly _tag = "CannotSplitRootNodeError";
}
