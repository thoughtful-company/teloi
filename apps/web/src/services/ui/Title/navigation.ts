import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { FrameT } from "@/services/ui/Frame";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";

export const navigateToFirstChild = (
  frameId: Id.Frame,
  nodeId: Id.Node,
  goalX?: number,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Frame = yield* FrameT;
    const Window = yield* WindowT;

    const children = yield* Node.getNodeChildren(nodeId);
    if (children.length === 0) return;

    const firstChildId = children[0]!;
    const targetBlockId = Id.makeFrameBlockId(frameId, firstChildId);

    // Preserve existing goalX if set (for chained arrow navigation)
    const existingSelection = yield* Frame.getSelection(frameId);
    const finalGoalX =
      Option.isSome(existingSelection) && existingSelection.value.goalX != null
        ? existingSelection.value.goalX
        : goalX;

    yield* Frame.setSelection(
      frameId,
      makeCollapsedSelection(
        targetBlockId,
        0,
        finalGoalX != null
          ? { goalX: finalGoalX, goalLine: "first" }
          : undefined,
      ),
    );
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  }).pipe(Effect.catchTag("FrameNotFoundError", () => Effect.void));
