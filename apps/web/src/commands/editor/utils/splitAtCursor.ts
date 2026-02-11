import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { FrameT } from "@/services/ui/Frame";
import { ViewT } from "@/services/ui/View";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const splitAtCursor = Effect.fn("splitAtCursor")(function* () {
  const View = yield* ViewT;
  const Automerge = yield* AutomergeT;
  const Frame = yield* FrameT;

  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { frameId, nodeId, blockId, isTitle } = ctx.value;

  const selection = yield* Frame.getSelection(frameId);
  const cursorPos = Option.isSome(selection)
    ? selection.value.selection.head
    : 0;

  const currentText = yield* Automerge.getText(nodeId);
  const clampedPos = Math.max(0, Math.min(cursorPos, currentText.length));

  const isAtStartOfNonEmpty = clampedPos === 0 && currentText.length > 0;
  const position = isAtStartOfNonEmpty ? "before" : "after";

  const newBlockId = yield* View.createBlock(blockId, position);
  const newCtx = Id.parseBlockContextSync(newBlockId);
  if (newCtx.type !== "frame") return;
  const newNodeId = newCtx.nodeId;

  if (isTitle || !isAtStartOfNonEmpty) {
    yield* Automerge.setText(nodeId, currentText.slice(0, clampedPos));
    yield* Automerge.setText(newNodeId, currentText.slice(clampedPos));
  }

  yield* Frame.enterBlockEditing(newBlockId, { anchor: 0, head: 0 });

  yield* Effect.logDebug("[splitAtCursor] Split completed").pipe(
    Effect.annotateLogs({
      nodeId,
      newNodeId,
      frameId,
      isTitle,
      cursorPos: clampedPos,
      textLength: currentText.length,
    }),
  );
});
