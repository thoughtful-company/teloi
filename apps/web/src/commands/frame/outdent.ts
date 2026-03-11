import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
import { Data, Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "../editor/utils/resolveActiveKhoraContext";

const scope = "frame";
const commandName = "outdent";
const tag = `${scope}:${commandName}` as const;

export class Outdent extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Outdent) {
    const Frame = yield* FrameT;
    const mode = yield* Frame.getMode();

    if (mode.type === "khora") {
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isNone(ctx)) return;

      const { frameId, nodeId } = ctx.value;
      yield* outdentNodes(frameId, [nodeId]);

      // Re-set selection to trigger ancestor expansion
      const selection = yield* Frame.getSelection(frameId);
      yield* Frame.setSelection(frameId, selection);
    }

    if (mode.type === "khoraSelection") {
      const { frameId } = mode;
      const state = yield* Frame.getKhoraSelectionState(frameId);
      if (state.selectedKhoras.length === 0 || state.anchor === null) return;

      yield* outdentNodes(frameId, state.selectedKhoras);

      yield* Frame.setKhoraSelection(
        frameId,
        state.selectedKhoras,
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
 * - First-level blocks in frame (parent is frame's assignedKhoraId)
 */
const outdentNodes = Effect.fn("outdentNodes")(function* (
  frameId: Id.Frame,
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

  // Can't outdent first-level blocks (parent is frame root)
  const frameDoc = yield* Store.getDocument("frame", frameId);
  const assignedKhoraId = Option.isSome(frameDoc)
    ? frameDoc.value.assignedKhoraId
    : null;
  if (assignedKhoraId && parentId === assignedKhoraId) return false;

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
