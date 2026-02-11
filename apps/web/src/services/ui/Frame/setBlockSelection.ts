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
    const normalizedSelection = normalizeBlockSelectionState(
      blocks,
      blockSelectionAnchor,
      blockSelectionFocus,
    );

    if (blocks.length > 0 && assignedNodeId) {
      const rootNodeId = Id.Node.make(assignedNodeId);
      yield* expandAncestorsForNodes(frameId, rootNodeId, blocks);
    }

    const nextFrame = {
      ...currentFrame,
      selectedBlocks: [...normalizedSelection.selectedBlocks],
      blockSelectionAnchor: normalizedSelection.anchor,
      blockSelectionFocus: normalizedSelection.focus,
      activePart: "body" as const,
      selection: null,
      focusMode: "blockSelection" as const,
    };
    yield* Store.setDocument("frame", nextFrame, frameId).pipe(Effect.orDie);

    yield* Effect.logDebug(
      "[Frame.setBlockSelection] Block selection updated",
    ).pipe(
      Effect.annotateLogs({
        frameId,
        selectedBlocks: normalizedSelection.selectedBlocks,
        blockSelectionAnchor: normalizedSelection.anchor,
        blockSelectionFocus: normalizedSelection.focus,
      }),
    );
  });

// ================================ Internal ==================================

const normalizeBlockSelectionState = (
  blocks: readonly Id.Node[],
  anchor: Id.Node | null,
  focus?: Id.Node | null,
) => {
  if (blocks.length === 0) {
    return {
      selectedBlocks: [] as readonly Id.Node[],
      anchor: null as Id.Node | null,
      focus: null as Id.Node | null,
    };
  }

  if (anchor == null && focus == null) {
    const fallback = blocks[0]!;
    return {
      selectedBlocks: blocks,
      anchor: fallback,
      focus: fallback,
    };
  }

  if (anchor == null) {
    return {
      selectedBlocks: blocks,
      anchor: focus ?? null,
      focus: focus ?? null,
    };
  }

  return {
    selectedBlocks: blocks,
    anchor,
    focus: focus ?? anchor,
  };
};
