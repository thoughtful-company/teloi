import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";

export class Right extends Data.TaggedClass("editor:right")<{}> {}

export const handle = Effect.fn("editor:right")(function* (_cmd: Right) {
  const Editor = yield* EditorT;

  const isAtEnd = yield* Editor.isCursorAtEnd();
  if (!isAtEnd) {
    yield* Editor.moveRight();
    return;
  }

  yield* navigateToNextBlock();
});

const navigateToNextBlock = Effect.fn("navigateToNextBlock")(function* () {
  const Window = yield* WindowT;
  const Buffer = yield* BufferT;

  const activeElement = yield* Window.getActiveElement();
  if (Option.isNone(activeElement) || activeElement.value.type !== "block") {
    return;
  }

  const blockId = activeElement.value.id;
  const blockContext = Id.parseBlockContextSync(blockId);
  if (blockContext.type !== "buffer") {
    return;
  }

  const { bufferId, nodeId } = blockContext;

  const targetOpt = yield* Buffer.findNextVisibleNode(nodeId, bufferId);
  if (Option.isNone(targetOpt)) {
    return;
  }

  const targetNodeId = targetOpt.value;
  const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(targetBlockId, 0),
  );
  yield* Window.setActiveElement(
    Option.some({ type: "block" as const, id: targetBlockId }),
  );
});
