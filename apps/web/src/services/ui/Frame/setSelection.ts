import { Id, Model } from "@/schema";
import * as IdT from "@/schema/id/id";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { FrameNotFoundError } from "../errors";
import { expandAncestors } from "./expandAncestors";

/**
 * Get the nodeId from a KhoraContext for expansion purposes.
 * Only frame khoras live in the outline tree. Section blocks are flat, and
 * property titles live under workspace:schema — neither has ancestors to expand.
 */
const getNodeIdForExpansion = (ctx: Id.KhoraContext): Id.Node | null => {
  switch (ctx.type) {
    case "frame":
      return ctx.nodeId;
    case "section":
    case "propertyTitle":
      return null;
  }
};

/**
 * Get the node whose Automerge text a khora's offsets should be clamped against.
 * Frame khoras point at their node; section blocks clamp against the host page's
 * text (legacy behavior); property titles clamp against the property node itself.
 */
const getTextNodeId = (ctx: Id.KhoraContext): Id.Node => {
  switch (ctx.type) {
    case "frame":
      return ctx.nodeId;
    case "section":
      return ctx.hostNodeId;
    case "propertyTitle":
      return ctx.propertyId;
  }
};

export const setSelection = (
  frameId: Id.Frame,
  selection: Option.Option<Model.ActiveKhoraSelection>,
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
    const assignedKhoraId = currentFrame.assignedKhoraId;
    let clampedSelection: Option.Option<Model.ActiveKhoraSelection> = selection;

    if (Option.isSome(selection)) {
      const blockContext = yield* IdT.parseKhoraContext(
        selection.value.khoraId,
      ).pipe(Effect.orDie);
      if (assignedKhoraId) {
        const rootNodeId = Id.Node.make(assignedKhoraId);
        const nodeId = getNodeIdForExpansion(blockContext);
        if (nodeId) {
          yield* expandAncestors(frameId, rootNodeId, nodeId);
        }
      }

      // Clamp offsets to text length — click position resolution can overshoot
      // when non-content DOM nodes (e.g. type badges) are inside the container
      const Automerge = yield* AutomergeT;
      const blockNodeId = getTextNodeId(blockContext);
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

    const prevActiveKhoraId = currentFrame.activeKhoraId ?? null;

    if (Option.isSome(clampedSelection)) {
      const s = clampedSelection.value;
      const nextKhoraId = s.khoraId;

      if (prevActiveKhoraId != null && prevActiveKhoraId !== nextKhoraId) {
        yield* clearKhoraTextSelection(Store, prevActiveKhoraId);
      }

      yield* writeKhoraTextSelection(Store, nextKhoraId, {
        anchor: s.selection.anchor,
        head: s.selection.head,
        assoc: s.selection.assoc,
        goalX: s.goalX,
        goalLine: s.goalLine,
      });

      yield* Store.setDocument(
        "frame",
        {
          ...currentFrame,
          activePart: "khora" as const,
          activeKhoraId: nextKhoraId,
          selectedKhoras: [],
          khoraSelectionAnchor: null,
          khoraSelectionFocus: null,
        },
        frameId,
      ).pipe(Effect.orDie);
    } else {
      if (prevActiveKhoraId != null) {
        yield* clearKhoraTextSelection(Store, prevActiveKhoraId);
      }

      yield* Store.setDocument(
        "frame",
        {
          ...currentFrame,
          activeKhoraId: null,
          selectedKhoras: [],
          khoraSelectionAnchor: null,
          khoraSelectionFocus: null,
        },
        frameId,
      ).pipe(Effect.orDie);
    }

    const logAnnotations = yield* Option.match(clampedSelection, {
      onNone: () =>
        Effect.succeed({ selection: null } as Record<string, unknown>),
      onSome: (s) =>
        Effect.gen(function* () {
          const blockContext = yield* IdT.parseKhoraContext(s.khoraId).pipe(
            Effect.orDie,
          );
          const Automerge = yield* AutomergeT;
          const nodeId = getTextNodeId(blockContext);
          const text = yield* Automerge.getText(nodeId);

          return {
            "selection.khoraId": s.khoraId,
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
        assignedKhoraId,
        ...logAnnotations,
      }),
    );
  });

// ================================ Internal ==================================

const clearKhoraTextSelection = (Store: StoreT["Type"], khoraId: Id.Khora) =>
  Effect.gen(function* () {
    const doc = yield* Store.getDocument("khora", khoraId).pipe(Effect.orDie);
    if (Option.isSome(doc)) {
      yield* Store.setDocument(
        "khora",
        { ...doc.value, textSelection: null },
        khoraId,
      ).pipe(Effect.orDie);
    }
  });

const writeKhoraTextSelection = (
  Store: StoreT["Type"],
  khoraId: Id.Khora,
  textSelection: Model.KhoraDocTextSelection,
) =>
  Effect.gen(function* () {
    const doc = yield* Store.getDocument("khora", khoraId).pipe(Effect.orDie);
    const existing = Option.isSome(doc)
      ? doc.value
      : {
          isExpanded: true,
          activeViewId: null,
          ghostChildId: null,
          ghostParentId: null,
        };
    yield* Store.setDocument(
      "khora",
      { ...existing, textSelection },
      khoraId,
    ).pipe(Effect.orDie);
  });
