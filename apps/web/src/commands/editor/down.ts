import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";
import { resolveGoalX } from "./utils/resolveGoalX";

const scope = "editor";
const commandName = "down";
const tag = `${scope}:${commandName}` as const;

export class Down extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Down) {
    const Editor = yield* EditorT;

    const isOnLastLine = yield* Editor.isCursorOnLastLine();
    if (!isOnLastLine) {
      yield* Editor.moveDown();
      return;
    }

    yield* navigateToNextBlock();
  });
}

/* ─── Private ─── */

const navigateToNextBlock = Effect.fn("navigateToNextBlock:down")(function* () {
  const Window = yield* WindowT;
  const Buffer = yield* BufferT;
  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { bufferId, nodeId } = ctx.value;

  const targetOpt = yield* Buffer.findNextVisibleNode(nodeId, bufferId);
  if (Option.isNone(targetOpt)) {
    const Editor = yield* EditorT;
    yield* Editor.moveDown();
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
