import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { Effect, Option } from "effect";

/** Clear goalX/goalLine from buffer selection. Called by horizontal navigation commands. */
export const clearGoalX = Effect.fn("clearGoalX")(function* (
  bufferId: Id.Buffer,
) {
  const Buffer = yield* BufferT;
  const sel = yield* Buffer.getSelection(bufferId);
  if (Option.isSome(sel) && sel.value.goalX != null) {
    yield* Buffer.setSelection(
      bufferId,
      Option.some({ ...sel.value, goalX: null, goalLine: null }),
    );
  }
});
