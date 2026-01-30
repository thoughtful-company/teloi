import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { Effect, Option } from "effect";

/** Uses preserved goalX from an ongoing vertical navigation, falling back to current cursor X. */
export const resolveGoalX = Effect.fn("resolveGoalX")(function* (
  bufferId: Id.Buffer,
) {
  const Buffer = yield* BufferT;
  const Editor = yield* EditorT;

  const existing = yield* Buffer.getSelection(bufferId);
  if (Option.isSome(existing) && existing.value.goalX != null) {
    return existing.value.goalX;
  }
  return yield* Editor.getGoalX();
});
