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

    const titleBlockId = Id.makeFrameBlockId(frameId, nodeId);

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
    const titleBlockQuery = queryDb(
      tables.block
        .select("value")
        .where("id", "=", titleBlockId)
        .first({ fallback: () => null }),
    );
    const titleBlockStream = yield* Store.subscribeStream(titleBlockQuery).pipe(
      Effect.orDie,
    );

    const windowDerived$ = Stream.zipLatestAll(
      windowStream,
      frameStream,
      titleBlockStream,
    ).pipe(
      Stream.map(([window, frame, titleBlock]) => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        const isActive =
          (isStageActiveFrame &&
            frame?.activePart === "head" &&
            frame?.activeBlockId === titleBlockId);

        let selection: TitleSelection | null = null;
        if (titleBlock?.selection) {
          selection = {
            anchor: titleBlock.selection.anchor,
            head: titleBlock.selection.head,
            goalX: frame?.goalX ?? null,
            goalLine: frame?.goalLine ?? null,
            assoc: titleBlock.selection.assoc,
          };
        }

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
