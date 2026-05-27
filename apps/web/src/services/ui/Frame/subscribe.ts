import { tables, TeloiNode } from "@/livestore/schema";
import { Id, Model } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Option, Stream } from "effect";
import { NodeT } from "../../domain/Node";

export interface FrameView {
  nodeData: TeloiNode;
  isKhoraSelectionMode: boolean;
  popup: Model.FramePopup | null;
}

export const subscribe = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

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

    const popupStream = frameStream.pipe(
      Stream.map((frame): Model.FramePopup | null => frame?.popup ?? null),
    );

    const frameDataStream = frameStream.pipe(
      Stream.map((frame) => frame?.assignedKhoraId ?? null),
      Stream.filterMap((nodeId) =>
        nodeId != null ? Option.some(Id.Node.make(nodeId)) : Option.none(),
      ),
      Stream.changesWith((a, b) => a === b),
    );

    const frameContentStream = Stream.flatMap(
      frameDataStream,
      (nodeId) => Stream.unwrap(Node.subscribe(nodeId)),
      { switch: true },
    );

    const contentWithMode = Stream.zipLatestWith(
      frameContentStream,
      focusModeStream,
      (nodeData, focusMode) => ({
        nodeData,
        isKhoraSelectionMode: focusMode.isKhoraSelectionMode,
      }),
    );

    return Stream.zipLatestWith(contentWithMode, popupStream, (content, popup) => ({
      ...content,
      popup,
    }));
  });
