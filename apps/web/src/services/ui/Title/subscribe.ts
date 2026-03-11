import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { deepEqual, queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";

export interface TitleSelection {
  anchor: number;
  head: number;
  goalX: number | null;
  goalLine: "first" | "last" | null;
  assoc: -1 | 0 | 1;
}

export interface TitleView {
  isActive: boolean;
  selection: TitleSelection | null;
  textContent: string;
}

export const subscribe = (frameId: Id.Frame, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Automerge = yield* AutomergeT;

    const titleBlockId = Id.makeFrameKhoraId(frameId, nodeId);

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
    const frameQuery = queryDb(
      tables.frame
        .select("value")
        .where("id", "=", frameId)
        .first({ fallback: () => null }),
    );
    const frameStream = yield* Store.subscribeStream(frameQuery).pipe(
      Effect.orDie,
    );
    // Subscribe to the title's khora doc for text selection
    const khoraQuery = queryDb(
      tables.khora
        .select("value")
        .where("id", "=", titleBlockId)
        .first({ fallback: () => null }),
    );
    const khoraStream = yield* Store.subscribeStream(khoraQuery).pipe(
      Effect.orDie,
    );

    // Combine all three doc streams so isActive and selection arrive atomically
    const windowDerived$ = Stream.zipLatestAll(
      windowStream,
      frameStream,
      khoraStream,
    ).pipe(
      Stream.map(([window, frame, khoraDoc]) => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        const isActive =
          isStageActiveFrame && frame?.activeKhoraId === titleBlockId;

        const ts = khoraDoc?.textSelection;
        const selection: TitleSelection | null =
          ts != null
            ? {
                anchor: ts.anchor,
                head: ts.head,
                goalX: ts.goalX,
                goalLine: ts.goalLine,
                assoc: ts.assoc,
              }
            : null;

        return { isActive, selection };
      }),
      Stream.changesWith(deepEqual),
    );

    // Text content stream
    const textStream = yield* Automerge.subscribeText(nodeId);
    const textContentStream = textStream.pipe(
      Stream.map((textData) => textData.content),
    );

    return Stream.zipLatestAll(windowDerived$, textContentStream).pipe(
      Stream.map(([{ isActive, selection }, textContent]) => ({
        isActive,
        selection,
        textContent,
      })),
    );
  });
