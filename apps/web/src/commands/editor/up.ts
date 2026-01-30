import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { resolveGoalX } from "./resolveGoalX";

export class Up extends Data.TaggedClass("editor:up")<{}> {}

export const handle = Effect.fn("editor:up")(function* (_cmd: Up) {
  const Editor = yield* EditorT;

  const isOnFirstLine = yield* Editor.isCursorOnFirstLine();
  if (!isOnFirstLine) {
    yield* Editor.moveUp();
    return;
  }

  yield* navigateToPreviousBlock();
});

const navigateToPreviousBlock = Effect.fn("navigateToPreviousBlock:up")(
  function* () {
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

    const targetOpt = yield* Buffer.findPreviousVisibleNode(nodeId, bufferId);
    if (Option.isNone(targetOpt)) {
      return;
    }

    const goalX = yield* resolveGoalX(bufferId);
    const targetNodeId = targetOpt.value;
    const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

    yield* Buffer.setSelection(
      bufferId,
      makeCollapsedSelection(targetBlockId, 0, { goalX, goalLine: "last" }),
    );
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  },
);
