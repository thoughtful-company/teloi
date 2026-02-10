import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { FrameNotFoundError } from "../errors";
import { expandAncestorsForNodes } from "./expandAncestors";

export const setBlockSelection = (
  frameId: Id.Frame,
  blocks: readonly Id.Node[],
  blockSelectionAnchor: Id.Node | null,
  blockSelectionFocus?: Id.Node | null,
): Effect.Effect<void, FrameNotFoundError, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
      Effect.orDie,
    );

    if (Option.isNone(frameDoc)) {
      return yield* Effect.fail(new FrameNotFoundError({ frameId }));
    }

    const currentFrame = frameDoc.value;
    const assignedNodeId = currentFrame.assignedNodeId;
    // Default focus to anchor if not provided
    const focus = blockSelectionFocus ?? blockSelectionAnchor;

    if (currentFrame.activeBlockId != null) {
      const activeBlockDoc = yield* Store.getDocument(
        "block",
        currentFrame.activeBlockId,
      ).pipe(Effect.orDie);
      if (Option.isSome(activeBlockDoc) && activeBlockDoc.value.selection) {
        yield* Store.setDocument(
          "block",
          { ...activeBlockDoc.value, selection: null },
          currentFrame.activeBlockId,
        ).pipe(Effect.orDie);
      }
    }

    if (blocks.length > 0 && assignedNodeId) {
      const rootNodeId = Id.Node.make(assignedNodeId);
      yield* expandAncestorsForNodes(frameId, rootNodeId, blocks);
    }

    const focusedBlockId =
      focus != null ? Id.makeFrameBlockId(frameId, focus) : currentFrame.activeBlockId;
    const nextFrame = {
      ...currentFrame,
      selectedBlocks: [...blocks],
      blockSelectionAnchor,
      blockSelectionFocus: blocks.length > 0 ? focus : null,
      activeBlockId: focusedBlockId,
      activePart: "body" as const,
    };
    yield* Store.setDocument("frame", nextFrame, frameId).pipe(Effect.orDie);

    yield* Effect.logDebug(
      "[Frame.setBlockSelection] Block selection updated",
    ).pipe(
      Effect.annotateLogs({
        frameId,
        selectedBlocks: blocks,
        blockSelectionAnchor,
        blockSelectionFocus: focus,
      }),
    );
  });
