import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

const scope = "editor";
const commandName = "left";
const tag = `${scope}:${commandName}` as const;

export class Left extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Left) {
    const Editor = yield* EditorT;

    const isAtStart = yield* Editor.isCursorAtStart();
    if (!isAtStart) {
      yield* Editor.moveLeft();
      const ctx = yield* resolveActiveBlockContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.bufferId);
      return;
    }

    yield* navigateToPreviousBlock();
  });
}

/* ─── Private ─── */

const navigateToPreviousBlock = Effect.fn("navigateToPreviousBlock:left")(
  function* () {
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;
    const Automerge = yield* AutomergeT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;
    const { bufferId, nodeId } = ctx.value;

    const targetOpt = yield* Buffer.findPreviousVisibleNode(nodeId, bufferId);
    if (Option.isNone(targetOpt)) return;

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
