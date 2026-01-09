import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";

export const navigateToFirstChild = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  goalX?: number,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Buffer = yield* BufferT;
    const Window = yield* WindowT;

    const children = yield* Node.getNodeChildren(nodeId);
    if (children.length === 0) return;

    const firstChildId = children[0]!;
    const targetBlockId = Id.makeBlockId(bufferId, firstChildId);

    // Preserve existing goalX if set (for chained arrow navigation)
    const existingSelection = yield* Buffer.getSelection(bufferId);
    const finalGoalX =
      Option.isSome(existingSelection) && existingSelection.value.goalX != null
        ? existingSelection.value.goalX
        : goalX;

    yield* Buffer.setSelection(
      bufferId,
      makeCollapsedSelection(
        firstChildId,
        0,
        finalGoalX != null
          ? { goalX: finalGoalX, goalLine: "first" }
          : undefined,
      ),
    );
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: targetBlockId }),
    );
  }).pipe(Effect.catchTag("BufferNotFoundError", () => Effect.void));
