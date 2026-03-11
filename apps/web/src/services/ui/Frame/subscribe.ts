import { tables, TeloiNode } from "@/livestore/schema";
import { Id, Model } from "@/schema";
import { StoreT } from "@/services/external/Store";
import {
  resolveActiveViewType,
  subscribeViewInfo,
  type ViewInfo,
  type ViewType,
} from "@/services/ui/Khora/views";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { queryDb } from "@livestore/livestore";
import { Context, Effect, Option, Stream } from "effect";
import { NodeT } from "../../domain/Node";

export interface FrameView {
  nodeData: TeloiNode;
  activeViewId: Id.Node | null;
  activeViewType: ViewType;
  availableViews: readonly ViewInfo[];
  isKhoraSelectionMode: boolean;
  popup: Model.FramePopup | null;
}

export const subscribe = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    // Context for subscribeViewInfo (called inside Stream.unwrap where
    // the outer generator's resolved services aren't automatically available)
    const viewContext = Context.make(TupleT, Tuple).pipe(
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
    );

    // Subscribe to frame document to watch for assignedKhoraId and activeViewId changes
    const frameQuery = queryDb(
      tables.frame
        .select("value")
        .where("id", "=", frameId)
        .first({ fallback: () => null }),
    );
    const frameStream = yield* Store.subscribeStream(frameQuery).pipe(
      Effect.orDie,
    );

    const sessionId = yield* Store.getSessionId();
    const worldId = Id.World.make(sessionId);
    const windowQuery = queryDb(
      tables.world
        .select("value")
        .where("id", "=", worldId)
        .first({ fallback: () => null }),
    );
    const windowStream = yield* Store.subscribeStream(windowQuery).pipe(
      Effect.orDie,
    );

    const focusModeStream = Stream.zipLatestWith(
      windowStream,
      frameStream,
      (window, frame) => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        if (!isStageActiveFrame) return { isKhoraSelectionMode: false };
        return {
          isKhoraSelectionMode: (frame?.selectedKhoras?.length ?? 0) > 0,
        };
      },
    ).pipe(
      Stream.changesWith(
        (a, b) => a.isKhoraSelectionMode === b.isKhoraSelectionMode,
      ),
    );

    // Separate popup stream — changes to popup should NOT re-subscribe to node/views
    const popupStream = frameStream.pipe(
      Stream.map((frame) => (frame?.popup as Model.FramePopup | null) ?? null),
    );

    // Structural data stream — only nodeId/activeViewId (deduped to avoid unnecessary re-subscriptions)
    const frameDataStream = frameStream.pipe(
      Stream.map((frame) => ({
        nodeId: frame?.assignedKhoraId ?? null,
        activeViewId: (frame?.activeViewId as Id.Node | null) ?? null,
      })),
      Stream.filterMap(({ nodeId, activeViewId }) =>
        nodeId != null
          ? Option.some({ nodeId: nodeId as Id.Node, activeViewId })
          : Option.none(),
      ),
      Stream.changesWith(
        (a, b) => a.nodeId === b.nodeId && a.activeViewId === b.activeViewId,
      ),
    );

    // For each frame state, create streams for the node and its views
    // switch: true ensures we cancel the old stream when assignedKhoraId changes
    const frameContentStream = Stream.flatMap(
      frameDataStream,
      ({ nodeId, activeViewId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const nodeStream = yield* Node.subscribe(nodeId);
            const viewInfoStream = yield* subscribeViewInfo(nodeId);

            return Stream.zipLatestWith(
              nodeStream,
              viewInfoStream,
              (nodeData, availableViews) => ({
                nodeData,
                activeViewId,
                availableViews,
              }),
            );
          }).pipe(Effect.provide(viewContext)),
        ),
      { switch: true },
    );

    // Auto-detect: when activeViewId is null and there's a typed view, activate it
    const autoDetectedStream = frameContentStream.pipe(
      Stream.tap(({ activeViewId, availableViews }) => {
        if (activeViewId !== null) return Effect.void;
        const typedView = availableViews.find(
          (v) => v.type === "chat" || v.type === "table",
        );
        if (!typedView) return Effect.void;
        const Frame = Effect.gen(function* () {
          const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(frameDoc)) return;
          yield* Store.setDocument(
            "frame",
            { ...frameDoc.value, activeViewId: typedView.id },
            frameId,
          ).pipe(Effect.orDie);
        });
        return Frame;
      }),
      Stream.map(({ nodeData, activeViewId, availableViews }) => ({
        nodeData,
        activeViewId,
        activeViewType: resolveActiveViewType(activeViewId, availableViews),
        availableViews,
      })),
    );

    // Combine frame content with focus mode and popup
    const contentWithMode = Stream.zipLatestWith(
      autoDetectedStream,
      focusModeStream,
      (content, focusMode) => ({
        ...content,
        isKhoraSelectionMode: focusMode.isKhoraSelectionMode,
      }),
    );

    return Stream.zipLatestWith(
      contentWithMode,
      popupStream,
      (content, popup) => ({
        ...content,
        popup,
      }),
    );
  });
