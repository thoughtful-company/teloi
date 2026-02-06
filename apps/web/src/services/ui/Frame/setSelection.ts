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

    // Write selection to window doc (colocated with activeElement)
    const windowId = currentFrame.windowId;
    const windowDoc = yield* Store.getDocument("window", windowId).pipe(
      Effect.orDie,
    );

    if (Option.isNone(windowDoc)) {
      return yield* Effect.die(
        new Error(`Window document not found: ${windowId}`),
      );
    }

    yield* Store.setDocument(
      "window",
      {
        ...windowDoc.value,
        selection: Option.getOrNull(clampedSelection),
      },
      windowId,
    ).pipe(Effect.orDie);

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
