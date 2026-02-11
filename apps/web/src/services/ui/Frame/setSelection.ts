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
  selection: Option.Option<Model.ActiveBlockSelection>,
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
    let clampedSelection: Option.Option<Model.ActiveBlockSelection> = selection;

    if (Option.isSome(selection)) {
      const blockContext = yield* IdT.parseBlockContext(
        selection.value.blockId,
      ).pipe(Effect.orDie);
      if (assignedNodeId) {
        const rootNodeId = Id.Node.make(assignedNodeId);
        const nodeId = getNodeIdForExpansion(blockContext);
        if (nodeId) {
          yield* expandAncestors(frameId, rootNodeId, nodeId);
        }
      }

      // Clamp offsets to text length — click position resolution can overshoot
      // when non-content DOM nodes (e.g. type badges) are inside the container
      const Automerge = yield* AutomergeT;
      const blockNodeId =
        blockContext.type === "frame"
          ? blockContext.nodeId
          : blockContext.hostNodeId;
      const blockText = yield* Automerge.getText(blockNodeId);
      const clampedAnchor = Math.min(
        selection.value.selection.anchor,
        blockText.length,
      );
      const clampedHead = Math.min(
        selection.value.selection.head,
        blockText.length,
      );

      clampedSelection = Option.some({
        ...selection.value,
        selection: {
          ...selection.value.selection,
          anchor: clampedAnchor,
          head: clampedHead,
        },
      });
    }

    let nextFrame = currentFrame;
    if (Option.isSome(clampedSelection)) {
      const s = clampedSelection.value;
      const targetBlockId = s.blockId;

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
        selection: s,
        selectedBlocks: [],
        focusMode: "editing",
      };
    } else {
      nextFrame = {
        ...currentFrame,
        selection: null,
        selectedBlocks: [],
      };
    }

    yield* Store.setDocument("frame", nextFrame, frameId).pipe(Effect.orDie);

    const logAnnotations = yield* Option.match(clampedSelection, {
      onNone: () =>
        Effect.succeed({ selection: null } as Record<string, unknown>),
      onSome: (s) =>
        Effect.gen(function* () {
          const blockContext = yield* IdT.parseBlockContext(s.blockId).pipe(
            Effect.orDie,
          );
          const Automerge = yield* AutomergeT;
          const nodeId =
            blockContext.type === "frame"
              ? blockContext.nodeId
              : blockContext.hostNodeId;
          const text = yield* Automerge.getText(nodeId);

          return {
            "selection.blockId": s.blockId,
            "selection.anchor": s.selection.anchor,
            "selection.head": s.selection.head,
            "selection.text": text,
            "selection.assoc": s.selection.assoc,
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
