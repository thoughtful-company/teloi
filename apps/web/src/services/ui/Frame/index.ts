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
import { setAssignedKhoraId } from "./setAssignedKhoraId";
import { setKhoraSelection } from "./setKhoraSelection";
import { setSelection } from "./setSelection";
import { FrameView, subscribe } from "./subscribe";

/**
 * Editor interaction mode derived from world/frame focus state.
 *
 * - "none": No element focused
 * - "khora": A block is focused for text editing
 * - "khoraSelection": A frame has khora selection mode active
 */
export type EditorMode =
  | { type: "none" }
  | { type: "khora"; khoraId: Id.Khora }
  | { type: "khoraSelection"; frameId: Id.Frame };

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
      Option.Option<Model.ActiveKhoraSelection>,
      FrameNotFoundError
    >;
    getAssignedKhoraId: (
      frameId: Id.Frame,
    ) => Effect.Effect<Id.Node | null, FrameNotFoundError>;
    setSelection: (
      frameId: Id.Frame,
      selection: Option.Option<Model.ActiveKhoraSelection>,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setAssignedKhoraId: (
      frameId: Id.Frame,
      nodeId: Id.Node | null,
    ) => Effect.Effect<void, FrameNotFoundError>;
    setKhoraSelection: (
      frameId: Id.Frame,
      blocks: readonly Id.Khora[],
      khoraSelectionAnchor: Id.Khora | null,
      khoraSelectionFocus?: Id.Khora | null,
    ) => Effect.Effect<void, FrameNotFoundError>;

    /**
     * Get khora selection state for a frame.
     */
    getKhoraSelectionState: (frameId: Id.Frame) => Effect.Effect<
      {
        selectedKhoras: readonly Id.Khora[];
        anchor: Id.Khora | null;
        focus: Id.Khora | null;
      },
      FrameNotFoundError
    >;

    // Mode operations (derived from world/frame focus state)
    /**
     * Get current editor mode from focused stage element.
     */
    getMode: () => Effect.Effect<EditorMode>;
    /**
     * Enter khora selection mode for a frame.
     */
    enterKhoraSelection: (frameId: Id.Frame) => Effect.Effect<void>;
    /**
     * Enter khora editing mode for a specific khora.
     * When selection is provided, sets selection atomically with the mode change
     * (merged setSelection + enterKhoraEditing in a single frame doc write).
     */
    enterKhoraEditing: (
      khoraId: Id.Khora,
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
          if (Option.isNone(frameDoc)) {
            return Option.none<Model.ActiveKhoraSelection>();
          }
          const activeKhoraId = frameDoc.value.activeKhoraId ?? null;
          if (activeKhoraId == null) {
            return Option.none<Model.ActiveKhoraSelection>();
          }
          const khoraDoc = yield* Store.getDocument(
            "khora",
            activeKhoraId,
          ).pipe(Effect.orDie);
          const textSel = Option.isSome(khoraDoc)
            ? (khoraDoc.value.textSelection ?? null)
            : null;
          if (textSel == null) {
            // Active khora but no text selection — still in editing mode
            return Option.some<Model.ActiveKhoraSelection>({
              khoraId: activeKhoraId,
              selection: { anchor: 0, head: 0, assoc: 0 },
              goalX: null,
              goalLine: null,
            });
          }
          return Option.some<Model.ActiveKhoraSelection>({
            khoraId: activeKhoraId,
            selection: {
              anchor: textSel.anchor,
              head: textSel.head,
              assoc: textSel.assoc,
            },
            goalX: textSel.goalX,
            goalLine: textSel.goalLine,
          });
        }),
      getAssignedKhoraId: (frameId: Id.Frame) =>
        get(frameId, "assignedKhoraId").pipe(
          Effect.map((id) => (id != null ? Id.Node.make(id) : null)),
          Effect.provideService(StoreT, Store),
        ),
      setSelection: withContext(setSelection)(context),
      setAssignedKhoraId: (frameId: Id.Frame, nodeId: Id.Node | null) =>
        setAssignedKhoraId(frameId, nodeId).pipe(
          Effect.provideService(StoreT, Store),
        ),
      setKhoraSelection: (
        frameId: Id.Frame,
        blocks: readonly Id.Khora[],
        khoraSelectionAnchor: Id.Khora | null,
        khoraSelectionFocus?: Id.Khora | null,
      ) =>
        setKhoraSelection(
          frameId,
          blocks,
          khoraSelectionAnchor,
          khoraSelectionFocus,
        ).pipe(Effect.provide(context)),

      getKhoraSelectionState: (frameId: Id.Frame) =>
        Effect.gen(function* () {
          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isSome(frameDoc)) {
            return deriveKhoraSelectionState(frameDoc.value);
          }

          return {
            selectedKhoras: [] as readonly Id.Node[],
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
          if (frame.activeKhoraId != null) {
            return { type: "khora" as const, khoraId: frame.activeKhoraId };
          }

          if ((frame.selectedKhoras?.length ?? 0) > 0) {
            return { type: "khoraSelection" as const, frameId: activeFrameId };
          }

          return { type: "none" as const };
        }),
      enterKhoraSelection: (frameId: Id.Frame): Effect.Effect<void> =>
        Effect.gen(function* () {
          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(frameDoc)) return;

          const frame = frameDoc.value;
          const state = deriveKhoraSelectionState(frame);
          const fallbackKhoraId =
            state.focus ?? state.anchor ?? frame.activeKhoraId ?? null;
          const selectedKhoras =
            state.selectedKhoras.length > 0
              ? state.selectedKhoras
              : fallbackKhoraId != null
                ? [fallbackKhoraId]
                : [];
          const normalized = normalizeKhoraSelectionState(
            selectedKhoras,
            state.anchor ?? fallbackKhoraId,
            state.focus ?? fallbackKhoraId,
          );

          // Clear previous khora's textSelection
          const prevActiveKhoraId = frame.activeKhoraId ?? null;
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

          yield* Store.setDocument(
            "frame",
            {
              ...frame,
              activePart: "khora",
              activeKhoraId: null,
              selectedKhoras: [...normalized.selectedKhoras],
              khoraSelectionAnchor: normalized.anchor,
              khoraSelectionFocus: normalized.focus,
            },
            frameId,
          ).pipe(Effect.orDie);

          yield* World.setActiveFrameId(frameId);
        }),
      enterKhoraEditing: (
        khoraId: Id.Khora,
        selection?: {
          anchor: number;
          head: number;
          assoc?: -1 | 0 | 1;
          goalX?: number | null;
          goalLine?: "first" | "last" | null;
        },
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const blockCtx = Id.parseKhoraContextSync(khoraId);
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
              khoraId,
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
            "[Frame.enterKhoraEditing] Khora editing entered",
          ).pipe(
            Effect.annotateLogs({
              khoraId,
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

const deriveKhoraSelectionState = (frame: Model.Frame) => {
  const normalized = normalizeKhoraSelectionState(
    frame.selectedKhoras ?? [],
    frame.khoraSelectionAnchor ?? null,
    frame.khoraSelectionFocus ?? null,
  );
  if (normalized.selectedKhoras.length === 0) {
    return {
      selectedKhoras: [] as readonly Id.Khora[],
      anchor: null as Id.Khora | null,
      focus: null as Id.Khora | null,
    };
  }

  return {
    selectedKhoras: normalized.selectedKhoras,
    anchor: normalized.anchor,
    focus: normalized.focus,
  };
};

const normalizeKhoraSelectionState = (
  blocks: readonly Id.Khora[],
  anchor: Id.Khora | null,
  focus: Id.Khora | null,
) => {
  if (blocks.length === 0) {
    return {
      selectedKhoras: [] as readonly Id.Khora[],
      anchor: null as Id.Khora | null,
      focus: null as Id.Khora | null,
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
      anchor: focus,
      focus,
    };
  }

  return {
    selectedKhoras: blocks,
    anchor,
    focus: focus ?? anchor,
  };
};
