import { Id, Model } from "@/schema";
import * as IdT from "@/schema/id/id";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { FrameNotFoundError } from "../errors";
import { expandAncestors } from "./expandAncestors";

/**
 * Get the nodeId from a BlockContext for expansion purposes.
 * Section blocks (linked blocks in property sections) are flat and don't need
 * ancestor expansion, so we return null for them.
 */
const getNodeIdForExpansion = (ctx: Id.BlockContext): Id.Node | null => {
  if (ctx.type === "frame") {
    return ctx.nodeId;
  }
  // Section blocks don't have tree hierarchy - skip ancestor expansion
  return null;
};

const BLOCK_DOC_DEFAULTS: Model.Block = {
  isExpanded: true,
  activeViewId: null,
  ghostChildId: null,
  ghostParentId: null,
  selection: null,
};

export const setSelection = (
  frameId: Id.Frame,
  selection: Option.Option<Model.FrameSelection>,
): Effect.Effect<void, FrameNotFoundError, StoreT | NodeT | AutomergeT> =>
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
    const previousActiveBlockId = currentFrame.activeBlockId;
    let clampedSelection: Option.Option<Model.FrameSelection> = selection;

    if (Option.isSome(selection) && assignedNodeId) {
      const rootNodeId = Id.Node.make(assignedNodeId);
      const { anchor, focus } = selection.value;

      const anchorContext = yield* IdT.parseBlockContext(anchor.elementId).pipe(
        Effect.orDie,
      );
      const anchorNodeId = getNodeIdForExpansion(anchorContext);
      if (anchorNodeId) {
        yield* expandAncestors(frameId, rootNodeId, anchorNodeId);
      }

      const focusContext = yield* IdT.parseBlockContext(focus.elementId).pipe(
        Effect.orDie,
      );
      const focusNodeId = getNodeIdForExpansion(focusContext);
      if (focusNodeId && focusNodeId !== anchorNodeId) {
        yield* expandAncestors(frameId, rootNodeId, focusNodeId);
      }

      // Clamp offsets to text length — click position resolution can overshoot
      // when non-content DOM nodes (e.g. type badges) are inside the container
      const Automerge = yield* AutomergeT;
      const getNodeId = (ctx: Id.BlockContext): Id.Node =>
        ctx.type === "frame" ? ctx.nodeId : ctx.hostNodeId;

      const anchorText = yield* Automerge.getText(getNodeId(anchorContext));
      const focusTextLen =
        focus.elementId === anchor.elementId
          ? anchorText.length
          : (yield* Automerge.getText(getNodeId(focusContext))).length;

      clampedSelection = Option.some({
        ...selection.value,
        anchorOffset: Math.min(selection.value.anchorOffset, anchorText.length),
        focusOffset: Math.min(selection.value.focusOffset, focusTextLen),
      });
    }

    // Keep block-level persisted selection as the primary source of text ranges.
    // Selection transition clears the previous active block.
    let nextFrame = currentFrame;
    if (Option.isSome(clampedSelection)) {
      const s = clampedSelection.value;
      const targetBlockId = s.focus.elementId;

      if (
        previousActiveBlockId != null &&
        previousActiveBlockId !== targetBlockId
      ) {
        const previousBlockDoc = yield* Store.getDocument(
          "block",
          previousActiveBlockId,
        ).pipe(Effect.orDie);
        if (Option.isSome(previousBlockDoc)) {
          yield* Store.setDocument(
            "block",
            { ...previousBlockDoc.value, selection: null },
            previousActiveBlockId,
          ).pipe(Effect.orDie);
        }
      }

      const targetBlockDoc = yield* Store.getDocument("block", targetBlockId).pipe(
        Effect.orDie,
      );
      const targetBlock = Option.getOrElse(
        targetBlockDoc,
        () => BLOCK_DOC_DEFAULTS,
      );
      const isSingleBlockRange = s.anchor.elementId === s.focus.elementId;
      const nextBlockSelection: Model.BlockSelection = {
        anchor: isSingleBlockRange ? s.anchorOffset : s.focusOffset,
        head: s.focusOffset,
        assoc: s.assoc,
      };
      yield* Store.setDocument(
        "block",
        {
          ...targetBlock,
          selection: nextBlockSelection,
        },
        targetBlockId,
      ).pipe(Effect.orDie);

      const rootNodeId = currentFrame.rootBlockId ?? assignedNodeId;
      const rootBlockId =
        rootNodeId != null
          ? Id.makeFrameBlockId(frameId, Id.Node.make(rootNodeId))
          : null;

      nextFrame = {
        ...currentFrame,
        activeBlockId: targetBlockId,
        activePart:
          rootBlockId != null && targetBlockId === rootBlockId
            ? ("head" as const)
            : ("body" as const),
        selectedBlocks: [],
        blockSelectionAnchor: null,
        blockSelectionFocus: null,
        goalX: s.goalX ?? null,
        goalLine: s.goalLine ?? null,
        assoc: s.assoc,
      };
    } else {
      if (previousActiveBlockId != null) {
        const previousBlockDoc = yield* Store.getDocument(
          "block",
          previousActiveBlockId,
        ).pipe(Effect.orDie);
        if (Option.isSome(previousBlockDoc) && previousBlockDoc.value.selection) {
          yield* Store.setDocument(
            "block",
            { ...previousBlockDoc.value, selection: null },
            previousActiveBlockId,
          ).pipe(Effect.orDie);
        }
      }

      nextFrame = {
        ...currentFrame,
        selectedBlocks: [],
        blockSelectionAnchor: null,
        blockSelectionFocus: null,
        goalX: null,
        goalLine: null,
      };
    }

    yield* Store.setDocument("frame", nextFrame, frameId).pipe(Effect.orDie);

    const logAnnotations = yield* Option.match(clampedSelection, {
      onNone: () =>
        Effect.succeed({ selection: null } as Record<string, unknown>),
      onSome: (s) =>
        Effect.gen(function* () {
          const focusContext = yield* IdT.parseBlockContext(
            s.focus.elementId,
          ).pipe(Effect.orDie);
          const Automerge = yield* AutomergeT;
          const focusNodeId =
            focusContext.type === "frame"
              ? focusContext.nodeId
              : focusContext.hostNodeId;
          const focusText = yield* Automerge.getText(focusNodeId);

          return {
            "selection.anchor": s.anchor.elementId,
            "selection.anchorOffset": s.anchorOffset,
            "selection.focus": s.focus.elementId,
            "selection.focusOffset": s.focusOffset,
            "selection.focusText": focusText,
            "selection.assoc": s.assoc,
            "selection.goalX": s.goalX,
            "selection.goalLine": s.goalLine,
          } as Record<string, unknown>;
        }),
    });

    yield* Effect.logDebug("[Frame.setSelection]").pipe(
      Effect.annotateLogs({
        frameId,
        assignedNodeId,
        ...logAnnotations,
      }),
    );
  });
