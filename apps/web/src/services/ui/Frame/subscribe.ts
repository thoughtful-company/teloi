import { tables, TeloiNode } from "@/livestore/schema";
import { Entity, Id, Model } from "@/schema";
import { StoreT } from "@/services/external/Store";
import {
  resolveActiveViewType,
  subscribeViewInfo,
  type ViewInfo,
  type ViewType,
} from "@/services/ui/Block/views";
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
  activeElement: Option.Option<Entity.Element>;
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

    // Subscribe to frame document to watch for assignedNodeId and activeViewId changes
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
    const windowId = Id.Window.make(sessionId);
    const windowQuery = queryDb(
      tables.window
        .select("value")
        .where("id", "=", windowId)
        .first({ fallback: () => null }),
    );
    const windowStream = yield* Store.subscribeStream(windowQuery).pipe(
      Effect.orDie,
    );

    const activeBlockSelectionStream = Stream.flatMap(
      frameStream.pipe(
        Stream.map((frame) => frame?.activeBlockId ?? null),
        Stream.changesWith((a, b) => a === b),
      ),
      (activeBlockId) => {
        if (activeBlockId == null) {
          return Stream.succeed(null as Model.BlockSelection | null);
        }

        return Stream.unwrap(
          Effect.gen(function* () {
            const blockQuery = queryDb(
              tables.block
                .select("value")
                .where("id", "=", activeBlockId)
                .first({ fallback: () => null }),
            );
            const blockStream = yield* Store.subscribeStream(blockQuery).pipe(
              Effect.orDie,
            );
            return blockStream.pipe(Stream.map((block) => block?.selection ?? null));
          }),
        );
      },
      { switch: true },
    );

    const activeElementStream = Stream.zipLatestAll(
      windowStream,
      frameStream,
      activeBlockSelectionStream,
    ).pipe(
      Stream.map(([window, frame, activeBlockSelection]) => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        if (!isStageActiveFrame) return Option.none<Entity.Element>();

        const selectedBlocks = frame?.selectedBlocks ?? [];
        if (selectedBlocks.length > 0) {
          return Option.some<Entity.Element>({ type: "frame", id: frameId });
        }

        const activeBlockId = frame?.activeBlockId ?? null;
        if (activeBlockId != null && activeBlockSelection != null) {
          return Option.some<Entity.Element>({ type: "block", id: activeBlockId });
        }

        return Option.some<Entity.Element>({ type: "frame", id: frameId });
      }),
      Stream.changesWith((a, b) => activeElementKey(a) === activeElementKey(b)),
    );

    // Separate popup stream — changes to popup should NOT re-subscribe to node/views
    const popupStream = frameStream.pipe(
      Stream.map((frame) => (frame?.popup as Model.FramePopup | null) ?? null),
    );

    // Structural data stream — only nodeId/activeViewId (deduped to avoid unnecessary re-subscriptions)
    const frameDataStream = frameStream.pipe(
      Stream.map((frame) => ({
        nodeId: frame?.assignedNodeId ?? null,
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
    // switch: true ensures we cancel the old stream when assignedNodeId changes
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

    // Combine frame content with active element and popup
    const contentWithElement = Stream.zipLatestWith(
      autoDetectedStream,
      activeElementStream,
      (content, activeElement) => ({
        ...content,
        activeElement,
      }),
    );

    return Stream.zipLatestWith(
      contentWithElement,
      popupStream,
      (content, popup) => ({
        ...content,
        popup,
      }),
    );
  });

const activeElementKey = (value: Option.Option<Entity.Element>): string =>
  Option.match(value, {
    onNone: () => "none",
    onSome: (el) => {
      switch (el.type) {
        case "window":
        case "pane":
        case "frame":
        case "block":
          return `${el.type}:${el.id}`;
        case "title":
          return `title:${el.frameId}`;
        case "property":
          return `property:${el.frameId}:${el.propertyId}`;
      }
    },
  });
