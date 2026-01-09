import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { WindowT } from "@/services/ui/Window";
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
}

export const subscribe = (bufferId: Id.Buffer, nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Window = yield* WindowT;
    const Store = yield* StoreT;

    const activeElementStream = yield* Window.subscribeActiveElement();

    const isActiveStream = activeElementStream.pipe(
      Stream.map((maybeActive) =>
        Option.match(maybeActive, {
          onNone: () => false,
          onSome: (el) => el.type === "title" && el.bufferId === bufferId,
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
      Stream.map((buffer): TitleSelection | null => {
        if (!buffer?.selection) return null;

        const sel = buffer.selection;
        // Only return selection if anchor is on this node (the title's node)
        if (sel.anchor.nodeId !== nodeId) {
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
      Stream.changesWith(deepEqual),
    );

    return Stream.zipLatestWith(
      isActiveStream,
      selectionStream,
      (isActive, selection) => ({
        isActive,
        selection,
      }),
    );
  });
