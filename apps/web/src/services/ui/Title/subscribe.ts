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
    const windowDerived$ = Stream.zipLatestWith(
      windowStream,
      frameStream,
      (window, frame) => {
        const isStageActiveFrame =
          (window?.activeRegion ?? "stage") === "stage" &&
          window?.activeFrameId === frameId;
        const isActive =
          isStageActiveFrame &&
          frame?.activePart === "head" &&
          frame?.selection?.blockId === titleBlockId;

        let selection: TitleSelection | null = null;
        if (frame?.selection?.blockId === titleBlockId) {
          selection = {
            anchor: frame.selection.selection.anchor,
            head: frame.selection.selection.head,
            goalX: frame.selection.goalX,
            goalLine: frame.selection.goalLine,
            assoc: frame.selection.selection.assoc,
          };
        }

        return { isActive, selection };
      },
    ).pipe(
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
