import { Context, Effect, Layer, Option, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { FrameNodeNotAssignedError, FrameNotFoundError } from "../errors";
import { WorldT } from "../World";
import { get } from "./get";
import { setAssignedNodeId } from "./setAssignedNodeId";
import { setBlockSelection } from "./setBlockSelection";
import { setSelection } from "./setSelection";
import { FrameView, subscribe } from "./subscribe";

/**
 * Editor interaction mode derived from world/frame focus state.
 *
 * - "none": No element focused
 * - "block": A block is focused for text editing
 * - "blockSelection": A frame has block selection mode active
 */
export type EditorMode =
  | { type: "none" }
  | { type: "block"; blockId: Id.Block }
  | { type: "blockSelection"; frameId: Id.Frame };

export class FrameT extends Context.Tag("FrameT")<
  FrameT,
  {
    subscribe: (
      frameId: Id.Frame,
    ) => Effect.Effect<
      Stream.Stream<FrameView, NodeNotFoundError>,
      | FrameNotFoundError
      | LiveStoreError
      | FrameNodeNotAssignedError
      | NodeNotFoundError
    >;
    getSelection: (
      frameId: Id.Frame,
    ) => Effect.Effect<
      Option.Option<Model.ActiveBlockSelection>,
      FrameNotFoundError
    >;
    getAssignedNodeId: (
      frameId: Id.Frame,
    ) => Effect.Effect<Id.Node | null, FrameNotFoundError>;
    setSelection: (
      frameId: Id.Frame,
      selection: Option.Option<Model.ActiveBlockSelection>,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setAssignedNodeId: (
      frameId: Id.Frame,
      nodeId: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setBlockSelection: (
      frameId: Id.Frame,
      blocks: readonly Id.Node[],
      blockSelectionAnchor: Id.Node | null,
      blockSelectionFocus?: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;

    /**
     * Get block selection state for a frame.
     */
    getBlockSelectionState: (frameId: Id.Frame) => Effect.Effect<
      {
        selectedBlocks: readonly Id.Node[];
        anchor: Id.Node | null;
        focus: Id.Node | null;
      },
      FrameNotFoundError
    >;

    // Mode operations (derived from world/frame focus state)
    /**
     * Get current editor mode from focused stage element.
     */
    getMode: () => Effect.Effect<EditorMode>;
    /**
     * Enter block selection mode for a frame.
     */
    enterBlockSelection: (frameId: Id.Frame) => Effect.Effect<void>;
    /**
     * Enter block editing mode for a specific block.
     * When selection is provided, sets selection atomically with the mode change
     * (merged setSelection + enterBlockEditing in a single frame doc write).
     */
    enterBlockEditing: (
      blockId: Id.Block,
      selection?: {
        anchor: number;
        head: number;
        assoc?: -1 | 0 | 1;
        goalX?: number | null;
        goalLine?: "first" | "last" | null;
      },
    ) => Effect.Effect<void>;
    /**
     * Clear focus (mode becomes "none").
     */
    clearFocus: () => Effect.Effect<void>;

    // Popup operations
    hasPopup: (frameId: Id.Frame) => Effect.Effect<boolean, FrameNotFoundError>;
    openPopup: (
      frameId: Id.Frame,
      popup: Model.FramePopup,
    ) => Effect.Effect<void, FrameNotFoundError>;
    closePopup: (frameId: Id.Frame) => Effect.Effect<void, FrameNotFoundError>;
    updatePopupQuery: (
      frameId: Id.Frame,
      query: string,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setActiveView: (
      frameId: Id.Frame,
      viewId: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;
  }
>() {}

export const FrameLive = Layer.effect(
  FrameT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;
    const World = yield* WorldT;

    const context = Context.make(StoreT, Store).pipe(
      Context.add(NodeT, Node),
      Context.add(TupleT, Tuple),
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
      Context.add(WorldT, World),
    );

    return {
      subscribe: withContext(subscribe)(context),
      getSelection: (frameId: Id.Frame) =>
        Effect.gen(function* () {
          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isSome(frameDoc) && frameDoc.value.selection != null) {
            return Option.some(frameDoc.value.selection);
          }

          return Option.none<Model.ActiveBlockSelection>();
        }),
      getAssignedNodeId: (frameId: Id.Frame) =>
        get(frameId, "assignedNodeId").pipe(
          Effect.map((id) => (id != null ? Id.Node.make(id) : null)),
          Effect.provideService(StoreT, Store),
        ),
      setSelection: withContext(setSelection)(context),
      setAssignedNodeId: (frameId: Id.Frame, nodeId: Id.Node | null) =>
        setAssignedNodeId(frameId, nodeId).pipe(
          Effect.provideService(StoreT, Store),
        ),
      setBlockSelection: (
        frameId: Id.Frame,
        blocks: readonly Id.Node[],
        blockSelectionAnchor: Id.Node | null,
        blockSelectionFocus?: Id.Node | null,
      ) =>
        setBlockSelection(
          frameId,
          blocks,
          blockSelectionAnchor,
          blockSelectionFocus,
        ).pipe(Effect.provide(context)),

      getBlockSelectionState: (frameId: Id.Frame) =>
        Effect.gen(function* () {
          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isSome(frameDoc)) {
            return deriveBlockSelectionState(frameDoc.value);
          }

          return {
            selectedBlocks: [] as readonly Id.Node[],
            anchor: null,
            focus: null,
          };
        }),

      // Mode operations
      getMode: (): Effect.Effect<EditorMode> =>
        Effect.gen(function* () {
          const sessionId = yield* Store.getSessionId();
          const worldId = Id.World.make(sessionId);
          const worldDoc = yield* Store.getDocument("world", worldId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(worldDoc)) return { type: "none" as const };

          const isStageActive =
            (worldDoc.value.activeRegion ?? "stage") === "stage";
          const activeFrameId = worldDoc.value.activeFrameId ?? null;
          if (!isStageActive || activeFrameId == null)
            return { type: "none" as const };

          const frameDoc = yield* Store.getDocument(
            "frame",
            activeFrameId,
          ).pipe(Effect.orDie);
          if (Option.isNone(frameDoc)) return { type: "none" as const };

          const frame = frameDoc.value;
          if (frame.selection != null) {
            return { type: "block" as const, blockId: frame.selection.blockId };
          }

          if (frame.focusMode !== "editing") {
            return { type: "blockSelection" as const, frameId: activeFrameId };
          }

          return { type: "none" as const };
        }),
      enterBlockSelection: (frameId: Id.Frame): Effect.Effect<void> =>
        Effect.gen(function* () {
          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(frameDoc)) return;

          const frame = frameDoc.value;
          const state = deriveBlockSelectionState(frame);
          const selectionNodeId =
            frame.selection != null
              ? (() => {
                  const ctx = Id.parseBlockContextSync(frame.selection.blockId);
                  return ctx.type === "frame" ? ctx.nodeId : null;
                })()
              : null;
          const fallbackNodeId =
            state.focus ?? state.anchor ?? selectionNodeId ?? null;
          const selectedBlocks =
            state.selectedBlocks.length > 0
              ? state.selectedBlocks
              : fallbackNodeId != null
                ? [fallbackNodeId]
                : [];
          const normalized = normalizeBlockSelectionState(
            selectedBlocks,
            state.anchor ?? fallbackNodeId,
            state.focus ?? fallbackNodeId,
          );

          // Write frame doc BEFORE world doc so focusModeStream sees
          // the correct focusMode when windowStream fires
          yield* Store.setDocument(
            "frame",
            {
              ...frame,
              activePart: "body",
              selection: null,
              selectedBlocks: [...normalized.selectedBlocks],
              blockSelectionAnchor: normalized.anchor,
              blockSelectionFocus: normalized.focus,
              focusMode: "blockSelection",
            },
            frameId,
          ).pipe(Effect.orDie);

          yield* World.setActiveFrameId(frameId);
        }),
      enterBlockEditing: (
        blockId: Id.Block,
        selection?: {
          anchor: number;
          head: number;
          assoc?: -1 | 0 | 1;
          goalX?: number | null;
          goalLine?: "first" | "last" | null;
        },
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const blockCtx = Id.parseBlockContextSync(blockId);
          if (blockCtx.type !== "frame") return;

          const frameId = blockCtx.frameId;
          const nextSelection = selection ?? {
            anchor: 0,
            head: 0,
            assoc: 0 as const,
            goalX: null,
            goalLine: null,
          };

          yield* setSelection(
            frameId,
            Option.some({
              blockId,
              selection: {
                anchor: nextSelection.anchor,
                head: nextSelection.head,
                assoc: nextSelection.assoc ?? 0,
              },
              goalX: nextSelection.goalX ?? null,
              goalLine: nextSelection.goalLine ?? null,
            }),
          ).pipe(Effect.provide(context), Effect.orDie);

          yield* World.setActiveFrameId(frameId);

          yield* Effect.logDebug(
            "[Frame.enterBlockEditing] Block editing entered",
          ).pipe(
            Effect.annotateLogs({
              blockId,
              frameId,
              "selection.anchor": nextSelection.anchor,
              "selection.head": nextSelection.head,
              "selection.assoc": nextSelection.assoc ?? 0,
              "selection.goalX": nextSelection.goalX ?? null,
              "selection.goalLine": nextSelection.goalLine ?? null,
            }),
          );
        }),
      clearFocus: (): Effect.Effect<void> => World.setActiveFrameId(null),

      // Popup operations
      hasPopup: (frameId: Id.Frame) =>
        get(frameId).pipe(
          Effect.map((frame) => frame.popup != null),
          Effect.provideService(StoreT, Store),
        ),
      openPopup: (frameId: Id.Frame, popup: Model.FramePopup) =>
        get(frameId).pipe(
          Effect.flatMap((frame) =>
            Store.setDocument("frame", { ...frame, popup }, frameId),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
      closePopup: (frameId: Id.Frame) =>
        get(frameId).pipe(
          Effect.flatMap((frame) =>
            Store.setDocument("frame", { ...frame, popup: null }, frameId),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
      updatePopupQuery: (frameId: Id.Frame, query: string) =>
        get(frameId).pipe(
          Effect.flatMap((frame) => {
            if (!frame.popup) return Effect.void;
            return Store.setDocument(
              "frame",
              { ...frame, popup: { ...frame.popup, query } },
              frameId,
            ).pipe(Effect.asVoid, Effect.orDie);
          }),
          Effect.provideService(StoreT, Store),
        ),
      setActiveView: (frameId: Id.Frame, viewId: Id.Node | null) =>
        get(frameId).pipe(
          Effect.flatMap((frame) =>
            Store.setDocument(
              "frame",
              { ...frame, activeViewId: viewId },
              frameId,
            ),
          ),
          Effect.asVoid,
          Effect.orDie,
          Effect.provideService(StoreT, Store),
        ),
    };
  }),
);

// ================================ Internal ==================================

const deriveBlockSelectionState = (frame: Model.Frame) => {
  const normalized = normalizeBlockSelectionState(
    frame.selectedBlocks ?? [],
    frame.blockSelectionAnchor ?? null,
    frame.blockSelectionFocus ?? null,
  );
  if (normalized.selectedBlocks.length === 0) {
    return {
      selectedBlocks: [] as readonly Id.Node[],
      anchor: null as Id.Node | null,
      focus: null as Id.Node | null,
    };
  }

  return {
    selectedBlocks: normalized.selectedBlocks,
    anchor: normalized.anchor,
    focus: normalized.focus,
  };
};

const normalizeBlockSelectionState = (
  blocks: readonly Id.Node[],
  anchor: Id.Node | null,
  focus: Id.Node | null,
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
      anchor: focus,
      focus,
    };
  }

  return {
    selectedBlocks: blocks,
    anchor,
    focus: focus ?? anchor,
  };
};
