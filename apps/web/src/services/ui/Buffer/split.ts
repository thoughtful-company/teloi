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

    const newNodeId = yield* Node.insertNode({
      parentId,
      insert: isAtStart ? "before" : "after",
      siblingId: nodeId,
    });

    if (!isAtStart) {
      const ytext = Yjs.getText(nodeId);
      const deleteLength = ytext.length - cursorPos;

      const deltas = yield* Yjs.getDeltasWithFormats(
        nodeId,
        cursorPos,
        deleteLength,
      );

      ytext.delete(cursorPos, deleteLength);

      yield* Yjs.insertWithFormats(newNodeId, 0, deltas);
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
