import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BlockT } from "@/services/ui/Block";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";

const scope = "buffer";
const commandName = "collapse";
const tag = `${scope}:${commandName}` as const;

/**
 * Progressive collapse command.
 *
 * - Expanded block with children → collapse it, stay on it
 * - Collapsed/childless block → navigate to parent (preserving mode)
 * - Root block (parent is buffer title) → focus title
 */
export class Collapse extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Collapse) {
    const Block = yield* BlockT;
    const Node = yield* NodeT;
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;

    const activeElement = yield* Window.getActiveElement();
    if (Option.isNone(activeElement)) return;

    const el = activeElement.value;

    if (el.type === "block") {
      yield* handleEditorMode(el.id, { Block, Node, Window, Buffer });
    } else if (el.type === "buffer") {
      yield* handleBlockSelectionMode(el.id, { Block, Node, Window, Buffer });
    }
  });
}

// ================================ Internal ==================================

interface Deps {
  Block: BlockT["Type"];
  Node: NodeT["Type"];
  Window: WindowT["Type"];
  Buffer: BufferT["Type"];
}

const handleEditorMode = Effect.fn("collapse:editorMode")(function* (
  blockId: Id.Block,
  deps: Deps,
) {
  const ctx = Id.parseBlockContextSync(blockId);
  if (ctx.type !== "buffer") return;

  const { bufferId, nodeId } = ctx;
  const blockDoc = yield* deps.Block.get(bufferId, nodeId);
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

  const assignedNodeId = yield* deps.Buffer.getAssignedNodeId(bufferId);

  if (parentId === assignedNodeId) {
    // Parent is title → focus title
    const titleBlockId = Id.makeBufferBlockId(bufferId, parentId);
    yield* deps.Window.setActiveElement(
      Option.some({ type: "block" as const, id: titleBlockId }),
    );
    return;
  }

  // Navigate to parent block, preserving goalX
  const parentBlockId = Id.makeBufferBlockId(bufferId, parentId);
  const currentSelection = yield* deps.Buffer.getSelection(bufferId);
  const goalX = Option.isSome(currentSelection)
    ? currentSelection.value.goalX
    : null;

  yield* deps.Block.setExpanded(parentBlockId, false);
  yield* deps.Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(parentBlockId, 0, { goalX }),
  );
  yield* deps.Window.setActiveElement(
    Option.some({ type: "block" as const, id: parentBlockId }),
  );
});

const handleBlockSelectionMode = Effect.fn("collapse:blockSelectionMode")(
  function* (bufferId: Id.Buffer, deps: Deps) {
    const { selectedBlocks } =
      yield* deps.Buffer.getBlockSelectionState(bufferId);
    if (selectedBlocks.length === 0) return;

    // Use the first selected block for progressive collapse
    const nodeId = selectedBlocks[0]!;
    const blockId = Id.makeBufferBlockId(bufferId, nodeId);
    const blockDoc = yield* deps.Block.get(bufferId, nodeId);
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

    const assignedNodeId = yield* deps.Buffer.getAssignedNodeId(bufferId);

    if (parentId === assignedNodeId) {
      // Parent is title → focus title
      const titleBlockId = Id.makeBufferBlockId(bufferId, parentId);
      yield* deps.Buffer.setBlockSelection(bufferId, [], nodeId);
      yield* deps.Window.setActiveElement(
        Option.some({ type: "block" as const, id: titleBlockId }),
      );
      return;
    }

    // Navigate to parent in block selection mode
    const parentBlockId = Id.makeBufferBlockId(bufferId, parentId);
    yield* deps.Block.setExpanded(parentBlockId, false);
    yield* deps.Buffer.setBlockSelection(
      bufferId,
      [parentId],
      parentId,
      parentId,
    );
  },
);
