import { Id } from "@/schema";
import { FrameT } from "@/services/ui/Frame";
import { EditorT } from "@/services/ui/Editor";
import { Effect, Option } from "effect";

/** Uses preserved goalX from an ongoing vertical navigation, falling back to current cursor X. */
export const resolveGoalX = Effect.fn("resolveGoalX")(function* (
  frameId: Id.Frame,
) {
  const Frame = yield* FrameT;
  const Editor = yield* EditorT;

  const existing = yield* Frame.getSelection(frameId);
  if (Option.isSome(existing) && existing.value.goalX != null) {
    return existing.value.goalX;
  }
  return yield* Editor.getGoalX();
});
