import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { KhoraT } from "@/services/ui/Khora";
import { FrameT } from "@/services/ui/Frame";
import { Data, Effect, Option } from "effect";

const scope = "frame";
const commandName = "collapse";
const tag = `${scope}:${commandName}` as const;

/**
 * Progressive collapse command.
 *
 * - Expanded block with children → collapse it, stay on it
 * - Collapsed/childless block → navigate to parent (preserving mode)
 * - Root block (parent is frame title) → focus title
 */
export class Collapse extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Collapse) {
    const Khora = yield* KhoraT;
    const Node = yield* NodeT;
    const Frame = yield* FrameT;

    const mode = yield* Frame.getMode();
    if (mode.type === "none") return;

    if (mode.type === "khora") {
      yield* handleEditorMode(mode.khoraId, { Khora, Node, Frame });
    } else if (mode.type === "khoraSelection") {
      yield* handleKhoraSelectionMode(mode.frameId, { Khora, Node, Frame });
    }
  });
}

// ================================ Internal ==================================

interface Deps {
  Khora: KhoraT["Type"];
  Node: NodeT["Type"];
  Frame: FrameT["Type"];
}

const handleEditorMode = Effect.fn("collapse:editorMode")(function* (
  khoraId: Id.Khora,
  deps: Deps,
) {
  const ctx = Id.parseKhoraContextSync(khoraId);
  if (ctx.type !== "frame") return;

  const { frameId, nodeId } = ctx;
  const blockDoc = yield* deps.Khora.get(frameId, nodeId);
  const children = yield* deps.Node.getNodeChildren(nodeId);

  if (blockDoc.isExpanded && (children.length > 0 || blockDoc.ghostChildId)) {
    yield* deps.Khora.setExpanded(khoraId, false);
    return;
  }

  // Navigate to parent (ghosts have no parent_links, use ghostParentId)
  const parentId =
    blockDoc.ghostParentId ??
    (yield* deps.Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () => Effect.succeed(null)),
    ));

  if (!parentId) return;

  const assignedKhoraId = yield* deps.Frame.getAssignedKhoraId(frameId);

  if (parentId === assignedKhoraId) {
    // Parent is title → focus title
    const titleBlockId = Id.makeFrameKhoraId(frameId, parentId);
    yield* deps.Frame.enterKhoraEditing(titleBlockId, {
      anchor: 0,
      head: 0,
    });
    return;
  }

  // Navigate to parent block, preserving goalX
  const parentBlockId = Id.makeFrameKhoraId(frameId, parentId);
  const currentSelection = yield* deps.Frame.getSelection(frameId);
  const goalX = Option.isSome(currentSelection)
    ? currentSelection.value.goalX
    : null;

  yield* deps.Khora.setExpanded(parentBlockId, false);
  yield* deps.Frame.enterKhoraEditing(parentBlockId, {
    anchor: 0,
    head: 0,
    goalX,
  });
});

const handleKhoraSelectionMode = Effect.fn("collapse:blockSelectionMode")(
  function* (frameId: Id.Frame, deps: Deps) {
    const state = yield* deps.Frame.getKhoraSelectionState(frameId);
    const targetKhoraId =
      state.focus ??
      state.anchor ??
      (state.selectedKhoras.length > 0 ? state.selectedKhoras[0]! : null);
    if (targetKhoraId == null) return;

    const nodeId = Id.khoraIdToNodeId(targetKhoraId);
    const blockDoc = yield* deps.Khora.get(frameId, nodeId);
    const children = yield* deps.Node.getNodeChildren(nodeId);

    if (blockDoc.isExpanded && (children.length > 0 || blockDoc.ghostChildId)) {
      yield* deps.Khora.setExpanded(targetKhoraId, false);
      return;
    }

    // Navigate to parent
    const parentId = yield* deps.Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () => Effect.succeed(null)),
    );

    if (!parentId) return;

    const assignedKhoraId = yield* deps.Frame.getAssignedKhoraId(frameId);

    if (parentId === assignedKhoraId) {
      // Parent is title → focus title
      const titleBlockId = Id.makeFrameKhoraId(frameId, parentId);
      yield* deps.Frame.enterKhoraEditing(titleBlockId, {
        anchor: 0,
        head: 0,
      });
      return;
    }

    // Navigate to parent in khora selection mode
    const parentKhoraId = Id.makeFrameKhoraId(frameId, parentId);
    yield* deps.Khora.setExpanded(parentKhoraId, false);
    yield* deps.Frame.setKhoraSelection(
      frameId,
      [parentKhoraId],
      parentKhoraId,
      parentKhoraId,
    );
  },
);
