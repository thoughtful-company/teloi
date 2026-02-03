import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { EditorT } from "@/services/ui/Editor";
import { ViewNavigationT } from "@/services/ui/ViewNavigation";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Data, Effect, Option } from "effect";
import { clearGoalX } from "./utils/clearGoalX";
import { resolveActiveBlockContext } from "./utils/resolveActiveBlockContext";

const scope = "editor";
const commandName = "right";
const tag = `${scope}:${commandName}` as const;

export class Right extends Data.TaggedClass(tag)<{}> {
  static readonly scope = scope;
  static readonly commandName = commandName;
  static readonly tag = tag;
  static handle = Effect.fn(tag)(function* (_cmd: Right) {
    const Editor = yield* EditorT;

    const isAtEnd = yield* Editor.isCursorAtEnd();
    if (!isAtEnd) {
      yield* Editor.moveRight();
      const ctx = yield* resolveActiveBlockContext();
      if (Option.isSome(ctx)) yield* clearGoalX(ctx.value.bufferId);
      return;
    }

    const ViewNav = yield* ViewNavigationT;
    const Window = yield* WindowT;
    const Buffer = yield* BufferT;

    const ctx = yield* resolveActiveBlockContext();
    if (Option.isNone(ctx)) return;
    const { bufferId, nodeId } = ctx.value;

    const targetOpt = yield* ViewNav.resolveBlockRight(nodeId, bufferId);
    if (Option.isNone(targetOpt)) return;

    const targetNodeId = targetOpt.value;
    const targetBlockId = Id.makeBufferBlockId(bufferId, targetNodeId);

    yield* Buffer.setSelection(
      bufferId,
      makeCollapsedSelection(targetBlockId, 0),
    );
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  });
}
