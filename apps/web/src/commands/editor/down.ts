import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { resolveGoalX } from "./resolveGoalX";

export class Down extends Data.TaggedClass("editor:down")<{}> {}

export const handle = Effect.fn("editor:down")(function* (_cmd: Down) {
  const Editor = yield* EditorT;

  const isOnLastLine = yield* Editor.isCursorOnLastLine();
  if (!isOnLastLine) {
    yield* Editor.moveDown();
    return;
  }

  yield* navigateToNextBlock();
});

const navigateToNextBlock = Effect.fn("navigateToNextBlock:down")(function* () {
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

  const targetOpt = yield* Buffer.findNextVisibleNode(nodeId, bufferId);
  if (Option.isNone(targetOpt)) {
    const text = yield* Automerge.getText(nodeId);
    yield* Buffer.setSelection(
      bufferId,
      makeCollapsedSelection(blockId, text.length),
    );
    return;
  }

  const goalX = yield* resolveGoalX(bufferId);
  const targetNodeId = targetOpt.value;
  const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(targetBlockId, 0, { goalX, goalLine: "first" }),
  );
  yield* Window.setActiveElement(
    Option.some({ type: "block" as const, id: targetBlockId }),
  );
});
