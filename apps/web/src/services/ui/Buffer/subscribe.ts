import { tables, TeloiNode } from "@/livestore/schema";
import { Entity, Id, Model } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
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

export interface BufferView {
  nodeData: TeloiNode;
  activeViewId: Id.Node | null;
  activeViewType: ViewType;
  availableViews: readonly ViewInfo[];
  activeElement: Option.Option<Entity.Element>;
  popup: Model.BufferPopup | null;
}

export const subscribe = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;
    const Window = yield* WindowT;

    // Context for subscribeViewInfo (called inside Stream.unwrap where
    // the outer generator's resolved services aren't automatically available)
    const viewContext = Context.make(TupleT, Tuple).pipe(
      Context.add(TypeT, Type),
      Context.add(AutomergeT, Automerge),
    );

    // Subscribe to buffer document to watch for assignedNodeId and activeViewId changes
    const bufferQuery = queryDb(
      tables.buffer
        .select("value")
        .where("id", "=", bufferId)
        .first({ fallback: () => null }),
    );
    const bufferStream = yield* Store.subscribeStream(bufferQuery).pipe(
      Effect.orDie,
    );

    // Subscribe to window's active element (for scroll-to-element on navigation)
    // No settling needed here - we're not mounting UI based on this timing
    const activeElementStream =
      (yield* Window.subscribeActiveElement()) as Stream.Stream<
        Option.Option<Entity.Element>
      >;

    // Separate popup stream — changes to popup should NOT re-subscribe to node/views
    const popupStream = bufferStream.pipe(
      Stream.map(
        (buffer) => (buffer?.popup as Model.BufferPopup | null) ?? null,
      ),
    );

    // Structural data stream — only nodeId/activeViewId (deduped to avoid unnecessary re-subscriptions)
    const bufferDataStream = bufferStream.pipe(
      Stream.map((buffer) => ({
        nodeId: buffer?.assignedNodeId ?? null,
        activeViewId: (buffer?.activeViewId as Id.Node | null) ?? null,
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

    // For each buffer state, create streams for the node and its views
    // switch: true ensures we cancel the old stream when assignedNodeId changes
    const bufferContentStream = Stream.flatMap(
      bufferDataStream,
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
    const autoDetectedStream = bufferContentStream.pipe(
      Stream.tap(({ activeViewId, availableViews }) => {
        if (activeViewId !== null) return Effect.void;
        const typedView = availableViews.find(
          (v) => v.type === "chat" || v.type === "table",
        );
        if (!typedView) return Effect.void;
        const Buffer = Effect.gen(function* () {
          const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
            Effect.orDie,
          );
          if (Option.isNone(bufferDoc)) return;
          yield* Store.setDocument(
            "buffer",
            { ...bufferDoc.value, activeViewId: typedView.id },
            bufferId,
          ).pipe(Effect.orDie);
        });
        return Buffer;
      }),
      Stream.map(({ nodeData, activeViewId, availableViews }) => ({
        nodeData,
        activeViewId,
        activeViewType: resolveActiveViewType(activeViewId, availableViews),
        availableViews,
      })),
    );

    // Combine buffer content with active element and popup
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
