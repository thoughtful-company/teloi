import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";

export class Left extends Data.TaggedClass("editor:left")<{}> {}

export const handle = Effect.fn("editor:left")(function* (_cmd: Left) {
  const Editor = yield* EditorT;

  const isAtStart = yield* Editor.isCursorAtStart();
  if (!isAtStart) {
    yield* Editor.moveLeft();
    return;
  }

  yield* navigateToPreviousBlock();
});

const navigateToPreviousBlock = Effect.fn("navigateToPreviousBlock")(
  function* () {
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;

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

    const targetOpt = yield* Buffer.findPreviousVisibleNode(nodeId, bufferId);
    if (Option.isNone(targetOpt)) {
      return;
    }

    const targetNodeId = targetOpt.value;
    const targetText = yield* Automerge.getText(targetNodeId);
    const endPos = targetText.length;
    const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

    yield* Buffer.setSelection(
      bufferId,
      makeCollapsedSelection(targetBlockId, endPos),
    );
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  },
);
