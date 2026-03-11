import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { FrameNotFoundError } from "../errors";
import { expandAncestorsForNodes } from "./expandAncestors";

export const setKhoraSelection = (
  frameId: Id.Frame,
  blocks: readonly Id.Node[],
  khoraSelectionAnchor: Id.Node | null,
  khoraSelectionFocus?: Id.Node | null,
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
    const assignedKhoraId = currentFrame.assignedKhoraId;
    const normalizedSelection = normalizeKhoraSelectionState(
      blocks,
      khoraSelectionAnchor,
      khoraSelectionFocus,
    );

    if (blocks.length > 0 && assignedKhoraId) {
      const rootNodeId = Id.Node.make(assignedKhoraId);
      yield* expandAncestorsForNodes(frameId, rootNodeId, blocks);
    }

    // Clear previous khora's textSelection
    const prevActiveKhoraId = currentFrame.activeKhoraId ?? null;
    if (prevActiveKhoraId != null) {
      const khoraDoc = yield* Store.getDocument(
        "khora",
        prevActiveKhoraId,
      ).pipe(Effect.orDie);
      if (Option.isSome(khoraDoc)) {
        yield* Store.setDocument(
          "khora",
          { ...khoraDoc.value, textSelection: null },
          prevActiveKhoraId,
        ).pipe(Effect.orDie);
      }
    }

    const nextFrame = {
      ...currentFrame,
      selectedKhoras: [...normalizedSelection.selectedKhoras],
      khoraSelectionAnchor: normalizedSelection.anchor,
      khoraSelectionFocus: normalizedSelection.focus,
      activePart: "khora" as const,
      activeKhoraId: null,
    };
    yield* Store.setDocument("frame", nextFrame, frameId).pipe(Effect.orDie);

    yield* Effect.logDebug(
      "[Frame.setKhoraSelection] Khora selection updated",
    ).pipe(
      Effect.annotateLogs({
        frameId,
        selectedKhoras: normalizedSelection.selectedKhoras,
        khoraSelectionAnchor: normalizedSelection.anchor,
        khoraSelectionFocus: normalizedSelection.focus,
      }),
    );
  });

// ================================ Internal ==================================

const normalizeKhoraSelectionState = (
  blocks: readonly Id.Node[],
  anchor: Id.Node | null,
  focus?: Id.Node | null,
) => {
  if (blocks.length === 0) {
    return {
      selectedKhoras: [] as readonly Id.Node[],
      anchor: null as Id.Node | null,
      focus: null as Id.Node | null,
    };
  }

  if (anchor == null && focus == null) {
    const fallback = blocks[0]!;
    return {
      selectedKhoras: blocks,
      anchor: fallback,
      focus: fallback,
    };
  }

  if (anchor == null) {
    return {
      selectedKhoras: blocks,
      anchor: focus ?? null,
      focus: focus ?? null,
    };
  }

  return {
    selectedKhoras: blocks,
    anchor,
    focus: focus ?? anchor,
  };
};
