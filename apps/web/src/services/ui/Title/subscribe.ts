import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import * as IdT from "@/schema/id/id";
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

    const windowDerived$ = windowStream.pipe(
      Stream.map((window) => {
        const activeElement = window?.activeElement ?? null;
        const isActive =
          activeElement !== null &&
          activeElement.type === "block" &&
          activeElement.id === titleBlockId;

        let selection: TitleSelection | null = null;
        if (window?.selection) {
          const sel = window.selection;
          const context = IdT.parseBlockContextSync(sel.anchor.elementId);
          if (context.type === "frame" && context.nodeId === nodeId) {
            selection = {
              anchor: sel.anchorOffset,
              head: sel.focusOffset,
              goalX: sel.goalX ?? null,
              goalLine: sel.goalLine ?? null,
              assoc: sel.assoc,
            };
          }
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
