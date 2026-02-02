import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { BufferT } from "@/services/ui/Buffer";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "../editor/utils/resolveActiveBlockContext";

const scope = "buffer";
const commandName = "outdent";
const tag = `${scope}:${commandName}` as const;

export class Outdent extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Outdent) {
    const Buffer = yield* BufferT;
    const mode = yield* Buffer.getMode();

    if (mode.type === "block") {
      const ctx = yield* resolveActiveBlockContext();
      if (Option.isNone(ctx)) return;

      const { bufferId, nodeId } = ctx.value;
      yield* outdentNodes(bufferId, [nodeId]);

      // Re-set selection to trigger ancestor expansion
      const selection = yield* Buffer.getSelection(bufferId);
      yield* Buffer.setSelection(bufferId, selection);
    }

    if (mode.type === "blockSelection") {
      const { bufferId } = mode;
      const state = yield* Buffer.getBlockSelectionState(bufferId);
      if (state.selectedBlocks.length === 0 || state.anchor === null) return;

      yield* outdentNodes(bufferId, state.selectedBlocks);

      yield* Buffer.setBlockSelection(
        bufferId,
        state.selectedBlocks,
        state.anchor,
        state.focus,
      );
    }
  });
}

// ================================ Internal ==================================

/**
 * Move nodes to become siblings of their parent (one level up).
 *
 * Cannot outdent:
 * - Root nodes (no parent)
 * - Nodes whose parent has no parent (would become root)
 * - First-level blocks in buffer (parent is buffer's assignedNodeId)
 */
const outdentNodes = Effect.fn("outdentNodes")(function* (
  bufferId: Id.Buffer,
  nodeIds: readonly Id.Node[],
) {
  const Node = yield* NodeT;
  const Store = yield* StoreT;

  const firstNode = nodeIds[0];
  if (!firstNode) return false;

  const parentId = yield* Node.getParent(firstNode).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );
  if (!parentId) return false;

  // Can't outdent first-level blocks (parent is buffer root)
  const bufferDoc = yield* Store.getDocument("buffer", bufferId);
  const assignedNodeId = Option.isSome(bufferDoc)
    ? bufferDoc.value.assignedNodeId
    : null;
  if (assignedNodeId && parentId === assignedNodeId) return false;

  const grandparentId = yield* Node.getParent(parentId).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );
  if (!grandparentId) return false;

  // Move in reverse to maintain relative ordering
  for (let i = nodeIds.length - 1; i >= 0; i--) {
    yield* Node.insertNode({
      nodeId: nodeIds[i]!,
      parentId: grandparentId,
      insert: "after",
      siblingId: parentId,
    });
  }

  return true;
});
