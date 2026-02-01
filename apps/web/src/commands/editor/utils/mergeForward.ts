import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";
import { resolveActiveBlockContext } from "./resolveActiveBlockContext";

export const mergeForward = Effect.fn("mergeForward")(function* () {
  const Editor = yield* EditorT;
  const Buffer = yield* BufferT;

  const ctx = yield* resolveActiveBlockContext();
  if (Option.isNone(ctx)) return;
  const { bufferId, nodeId, blockId } = ctx.value;

  const result = yield* Buffer.mergeForward(bufferId, nodeId);
  if (Option.isNone(result)) return;

  const { cursorOffset } = result.value;

  yield* Buffer.setSelection(
    bufferId,
    makeCollapsedSelection(blockId, cursorOffset),
  );
  yield* Editor.setCursor(cursorOffset);
});
