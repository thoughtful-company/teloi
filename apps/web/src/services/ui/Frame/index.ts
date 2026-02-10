import { Context, Effect, Layer, Option, Stream } from "effect";
import { LiveStoreError, StoreT } from "../../external/Store";

import { Id, Model } from "@/schema";
import { NodeNotFoundError } from "@/services/domain/errors";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { withContext } from "@/utils";
import { NodeT } from "../../domain/Node";
import { WorldT } from "../World";
import { FrameNodeNotAssignedError, FrameNotFoundError } from "../errors";
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
    ) => Effect.Effect<Option.Option<Model.FrameSelection>, FrameNotFoundError>;
    getAssignedNodeId: (
      frameId: Id.Frame,
    ) => Effect.Effect<Id.Node | null, FrameNotFoundError>;
    setSelection: (
      frameId: Id.Frame,
      selection: Option.Option<Model.FrameSelection>,
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
     */
    enterBlockEditing: (blockId: Id.Block) => Effect.Effect<void>;
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
          if (Option.isSome(frameDoc) && frameDoc.value.activeBlockId != null) {
            const blockId = frameDoc.value.activeBlockId;
            const blockDoc = yield* Store.getDocument("block", blockId).pipe(
              Effect.orDie,
            );
            if (Option.isSome(blockDoc) && blockDoc.value.selection != null) {
              const blockSelection = blockDoc.value.selection;
              return Option.some<Model.FrameSelection>({
                anchor: { elementId: blockId },
                anchorOffset: blockSelection.anchor,
                focus: { elementId: blockId },
                focusOffset: blockSelection.head,
                goalX: frameDoc.value.goalX ?? null,
                goalLine: frameDoc.value.goalLine ?? null,
                assoc: blockSelection.assoc ?? frameDoc.value.assoc ?? 0,
              });
            }
          }

          return Option.none<Model.FrameSelection>();
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

          const isStageActive = (worldDoc.value.activeRegion ?? "stage") === "stage";
          const activeFrameId = worldDoc.value.activeFrameId ?? null;
          if (!isStageActive || activeFrameId == null) return { type: "none" as const };

          const frameDoc = yield* Store.getDocument("frame", activeFrameId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(frameDoc)) return { type: "none" as const };

          const frame = frameDoc.value;
          if ((frame.selectedBlocks ?? []).length > 0) {
            return { type: "blockSelection" as const, frameId: activeFrameId };
          }

          if (frame.activeBlockId == null) {
            return { type: "blockSelection" as const, frameId: activeFrameId };
          }

          const blockDoc = yield* Store.getDocument("block", frame.activeBlockId).pipe(
            Effect.orDie,
          );
          if (Option.isSome(blockDoc) && blockDoc.value.selection != null) {
            return { type: "block" as const, blockId: frame.activeBlockId };
          }

          return { type: "blockSelection" as const, frameId: activeFrameId };
        }),
      enterBlockSelection: (frameId: Id.Frame): Effect.Effect<void> =>
        Effect.gen(function* () {
          yield* World.setActiveFrameId(frameId);

          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(frameDoc)) return;

          const state = deriveBlockSelectionState(frameDoc.value);
          const focusedBlockId =
            state.focus != null
              ? Id.makeFrameBlockId(frameId, state.focus)
              : frameDoc.value.activeBlockId;

          yield* Store.setDocument(
            "frame",
            {
              ...frameDoc.value,
              activePart: "body",
              activeBlockId: focusedBlockId,
            },
            frameId,
          ).pipe(Effect.orDie);
        }),
      enterBlockEditing: (blockId: Id.Block): Effect.Effect<void> =>
        Effect.gen(function* () {
          const blockCtx = Id.parseBlockContextSync(blockId);
          if (blockCtx.type !== "frame") return;

          const frameId = blockCtx.frameId;
          yield* World.setActiveFrameId(frameId);

          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(frameDoc)) return;

          const rootNodeId = frameDoc.value.rootBlockId ?? frameDoc.value.assignedNodeId;
          const rootBlockId =
            rootNodeId != null
              ? Id.makeFrameBlockId(frameId, Id.Node.make(rootNodeId))
              : null;

          yield* Store.setDocument(
            "frame",
            {
              ...frameDoc.value,
              activeBlockId: blockId,
              activePart:
                rootBlockId != null && blockId === rootBlockId
                  ? ("head" as const)
                  : ("body" as const),
              selectedBlocks: [],
            },
            frameId,
          ).pipe(Effect.orDie);
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

const resolveFocusedNodeId = (frame: Model.Frame): Id.Node | null => {
  if (frame.activeBlockId == null) return null;
  try {
    const ctx = Id.parseBlockContextSync(frame.activeBlockId);
    if (ctx.type !== "frame") return null;
    return ctx.nodeId;
  } catch {
    return null;
  }
};

const deriveBlockSelectionState = (frame: Model.Frame) => {
  const selectedBlocks = frame.selectedBlocks ?? [];
  if (selectedBlocks.length === 0) {
    return {
      selectedBlocks: [] as readonly Id.Node[],
      anchor: null as Id.Node | null,
      focus: null as Id.Node | null,
    };
  }

  const first = selectedBlocks[0]!;
  const last = selectedBlocks[selectedBlocks.length - 1]!;
  const focusedNodeId = resolveFocusedNodeId(frame);
  const focus =
    focusedNodeId != null && selectedBlocks.includes(focusedNodeId)
      ? focusedNodeId
      : last;

  const anchor =
    selectedBlocks.length === 1 ? focus : focus === first ? last : first;

  return {
    selectedBlocks,
    anchor,
    focus,
  };
};
