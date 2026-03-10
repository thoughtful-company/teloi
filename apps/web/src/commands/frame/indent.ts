import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { FrameT } from "@/services/ui/Frame";
import { Data, Effect, Option } from "effect";
import { resolveActiveKhoraContext } from "../editor/utils/resolveActiveKhoraContext";

const scope = "frame";
const commandName = "indent";
const tag = `${scope}:${commandName}` as const;

export class Indent extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Indent) {
    const Frame = yield* FrameT;
    const mode = yield* Frame.getMode();

    if (mode.type === "khora") {
      const ctx = yield* resolveActiveKhoraContext();
      if (Option.isNone(ctx)) return;

      const { frameId, nodeId } = ctx.value;
      yield* indentNodes([nodeId]);

      // Re-set selection to trigger ancestor expansion
      const selection = yield* Frame.getSelection(frameId);
      yield* Frame.setSelection(frameId, selection);
    }

    if (mode.type === "khoraSelection") {
      const { frameId } = mode;
      const state = yield* Frame.getKhoraSelectionState(frameId);
      if (state.selectedKhoras.length === 0 || state.anchor === null) return;

      yield* indentNodes(state.selectedKhoras);

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
 * Move nodes to become children of their previous sibling.
 *
 * Cannot indent:
 * - Nodes with no parent (root nodes)
 * - First siblings (no previous sibling to indent into)
 */
const indentNodes = Effect.fn("indentNodes")(function* (
  nodeIds: readonly Id.Node[],
) {
  const Node = yield* NodeT;

  const firstNode = nodeIds[0];
  if (!firstNode) return Option.none<Id.Node>();

  const parentId = yield* Node.getParent(firstNode).pipe(
    Effect.catchTag("NodeHasNoParentError", () =>
      Effect.succeed<Id.Node | null>(null),
    ),
  );
  if (!parentId) return Option.none<Id.Node>();

  const siblings = yield* Node.getNodeChildren(parentId);
  const firstIndex = siblings.indexOf(firstNode);
  if (firstIndex <= 0) return Option.none<Id.Node>();

  const prevSiblingId = siblings[firstIndex - 1]!;

  for (const nodeId of nodeIds) {
    yield* Node.insertNode({
      nodeId,
      parentId: prevSiblingId,
      insert: "after",
    });
  }

  return Option.some(prevSiblingId);
});
