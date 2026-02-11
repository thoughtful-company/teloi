import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BlockT } from "@/services/ui/Block";
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
    const Block = yield* BlockT;
    const Node = yield* NodeT;
    const Frame = yield* FrameT;

    const mode = yield* Frame.getMode();
    if (mode.type === "none") return;

    if (mode.type === "block") {
      yield* handleEditorMode(mode.blockId, { Block, Node, Frame });
    } else if (mode.type === "blockSelection") {
      yield* handleBlockSelectionMode(mode.frameId, { Block, Node, Frame });
    }
  });
}

// ================================ Internal ==================================

interface Deps {
  Block: BlockT["Type"];
  Node: NodeT["Type"];
  Frame: FrameT["Type"];
}

const handleEditorMode = Effect.fn("collapse:editorMode")(function* (
  blockId: Id.Block,
  deps: Deps,
) {
  const ctx = Id.parseBlockContextSync(blockId);
  if (ctx.type !== "frame") return;

  const { frameId, nodeId } = ctx;
  const blockDoc = yield* deps.Block.get(frameId, nodeId);
  const children = yield* deps.Node.getNodeChildren(nodeId);

  if (blockDoc.isExpanded && (children.length > 0 || blockDoc.ghostChildId)) {
    yield* deps.Block.setExpanded(blockId, false);
    return;
  }

  // Navigate to parent (ghosts have no parent_links, use ghostParentId)
  const parentId =
    blockDoc.ghostParentId ??
    (yield* deps.Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () => Effect.succeed(null)),
    ));

  if (!parentId) return;

  const assignedNodeId = yield* deps.Frame.getAssignedNodeId(frameId);

  if (parentId === assignedNodeId) {
    // Parent is title → focus title
    const titleBlockId = Id.makeFrameBlockId(frameId, parentId);
    yield* deps.Frame.enterBlockEditing(titleBlockId, {
      anchor: 0,
      head: 0,
    });
    return;
  }

  // Navigate to parent block, preserving goalX
  const parentBlockId = Id.makeFrameBlockId(frameId, parentId);
  const currentSelection = yield* deps.Frame.getSelection(frameId);
  const goalX = Option.isSome(currentSelection)
    ? currentSelection.value.goalX
    : null;

  yield* deps.Block.setExpanded(parentBlockId, false);
  yield* deps.Frame.enterBlockEditing(parentBlockId, {
    anchor: 0,
    head: 0,
    goalX,
  });
});

const handleBlockSelectionMode = Effect.fn("collapse:blockSelectionMode")(
  function* (frameId: Id.Frame, deps: Deps) {
    const state = yield* deps.Frame.getBlockSelectionState(frameId);
    const nodeId =
      state.focus ??
      state.anchor ??
      (state.selectedBlocks.length > 0 ? state.selectedBlocks[0]! : null);
    if (nodeId == null) return;

    // Use block-selection focus as the progressive collapse cursor.
    const blockId = Id.makeFrameBlockId(frameId, nodeId);
    const blockDoc = yield* deps.Block.get(frameId, nodeId);
    const children = yield* deps.Node.getNodeChildren(nodeId);

    if (blockDoc.isExpanded && (children.length > 0 || blockDoc.ghostChildId)) {
      yield* deps.Block.setExpanded(blockId, false);
      return;
    }

    // Navigate to parent
    const parentId = yield* deps.Node.getParent(nodeId).pipe(
      Effect.catchTag("NodeHasNoParentError", () => Effect.succeed(null)),
    );

    if (!parentId) return;

    const assignedNodeId = yield* deps.Frame.getAssignedNodeId(frameId);

    if (parentId === assignedNodeId) {
      // Parent is title → focus title
      const titleBlockId = Id.makeFrameBlockId(frameId, parentId);
      yield* deps.Frame.enterBlockEditing(titleBlockId, {
        anchor: 0,
        head: 0,
      });
      return;
    }

    // Navigate to parent in block selection mode
    const parentBlockId = Id.makeFrameBlockId(frameId, parentId);
    yield* deps.Block.setExpanded(parentBlockId, false);
    yield* deps.Frame.setBlockSelection(
      frameId,
      [parentId],
      parentId,
      parentId,
    );
  },
);
