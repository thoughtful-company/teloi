import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { BufferT } from "@/services/ui/Buffer";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const splitAtCursor = Effect.fn("splitAtCursor")(function* () {
  const ViewNav = yield* ViewNavigationT;
  const Automerge = yield* AutomergeT;
  const Buffer = yield* BufferT;
  const Window = yield* WindowT;

  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { bufferId, nodeId, isTitle } = ctx.value;

  const selection = yield* Buffer.getSelection(bufferId);
  const cursorPos = Option.isSome(selection) ? selection.value.focusOffset : 0;

  const currentText = yield* Automerge.getText(nodeId);
  const clampedPos = Math.max(0, Math.min(cursorPos, currentText.length));

  const isAtStartOfNonEmpty = clampedPos === 0 && currentText.length > 0;
  const position = isAtStartOfNonEmpty ? "before" : "after";

  const newNodeId = yield* ViewNav.createBlock(nodeId, bufferId, position);

  if (isTitle || !isAtStartOfNonEmpty) {
    yield* Automerge.setText(nodeId, currentText.slice(0, clampedPos));
    yield* Automerge.setText(newNodeId, currentText.slice(clampedPos));
  }

  const newBlockId = Id.makeBufferBlockId(bufferId, newNodeId);
  yield* Buffer.setSelection(bufferId, makeCollapsedSelection(newBlockId, 0));
  yield* Window.setActiveElement(
    Option.some({ type: "block" as const, id: newBlockId }),
  );

  yield* Effect.logDebug("[splitAtCursor] Split completed").pipe(
    Effect.annotateLogs({
      nodeId,
      newNodeId,
      bufferId,
      isTitle,
      cursorPos: clampedPos,
      textLength: currentText.length,
    }),
  );
});
