import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { Effect, Option } from "effect";

/** Clear goalX/goalLine from frame selection. Called by horizontal navigation commands. */
export const clearGoalX = Effect.fn("clearGoalX")(function* (
  frameId: Id.Frame,
) {
  const Frame = yield* FrameT;
  const sel = yield* Frame.getSelection(frameId);
  if (Option.isSome(sel) && sel.value.goalX != null) {
    yield* Frame.setSelection(
      frameId,
      Option.some({ ...sel.value, goalX: null, goalLine: null }),
    );
  }
});
