import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import * as IdT from "@/schema/id/id";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { settleActiveElement, WindowT } from "@/services/ui/Window";
import { deepEqual, queryDb } from "@livestore/livestore";
import { Effect, Option, Stream } from "effect";

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

export const subscribe = (bufferId: Id.Buffer, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    const Store = yield* StoreT;
    const Automerge = yield* AutomergeT;

    // Title is just the root block of a buffer
    const titleBlockId = Id.makeBufferBlockId(bufferId, nodeId);

    const unsettledActiveElement = yield* Window.subscribeActiveElement();
    // Settle the stream: delay by 2 frames so selection state propagates first
    const activeElementStream = settleActiveElement(unsettledActiveElement);

    const isActiveStream = activeElementStream.pipe(
      Stream.map((maybeActive) =>
        Option.match(maybeActive, {
          onNone: () => false,
          onSome: (el) => el.type === "block" && el.id === titleBlockId,
        }),
      ),
      Stream.changesWith((a, b) => a === b),
    );

    const query = queryDb(
      tables.buffer
        .select("value")
        .where("id", "=", bufferId)
        .first({ fallback: () => null }),
    );
    const bufferStream = yield* Store.subscribeStream(query).pipe(Effect.orDie);

    const selectionStream = bufferStream.pipe(
      Stream.mapEffect((buffer): Effect.Effect<TitleSelection | null> => {
        if (!buffer?.selection) return Effect.succeed(null);

        const sel = buffer.selection;
        // Only return selection if anchor is on this node (the title's node)
        // Section blocks can never be the title, so only check buffer blocks
        return IdT.parseBlockContext(sel.anchor.elementId).pipe(
          Effect.map((context) => {
            // Only buffer blocks can be the title
            if (context.type !== "buffer" || context.nodeId !== nodeId) {
              return null;
            }
            return {
              anchor: sel.anchorOffset,
              head: sel.focusOffset,
              goalX: sel.goalX ?? null,
              goalLine: sel.goalLine ?? null,
              assoc: sel.assoc,
            };
          }),
          Effect.orDie,
        );
      }),
      Stream.changesWith(deepEqual),
    );

    // Text content stream
    const textStream = yield* Automerge.subscribeText(nodeId);
    const textContentStream = textStream.pipe(
      Stream.map((textData) => textData.content),
    );

    return Stream.zipLatestAll(
      isActiveStream,
      selectionStream,
      textContentStream,
    ).pipe(
      Stream.map(([isActive, selection, textContent]) => ({
        isActive,
        selection,
        textContent,
      })),
    );
  });
