import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Context, Data, Effect, Layer, Option, Stream } from "effect";

export class WindowNotFoundError extends Data.TaggedError(
  "WindowNotFoundError",
)<{
  windowId: string;
}> {}

export class WindowT extends Context.Tag("WindowT")<
  WindowT,
  {
    subscribeActiveFrameId: () => Effect.Effect<
      Stream.Stream<Option.Option<Id.Frame>>
    >;
    setActiveFrameId: (frameId: Id.Frame | null) => Effect.Effect<void>;
    getActiveFrameId: () => Effect.Effect<Option.Option<Id.Frame>>;
  }
>() {}

export const WindowLive = Layer.effect(
  WindowT,
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const getWindowDoc = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);
        const windowDoc = yield* Store.getDocument("window", windowId).pipe(
          Effect.orDie,
        );
        return { windowId, windowDoc };
      });

    const subscribeActiveFrameId = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);

        const query = queryDb(
          tables.window
            .select("value")
            .where("id", "=", windowId)
            .first({ fallback: () => null }),
          { label: `window-activeFrame-${windowId}`, deps: [windowId] },
        );

        const stream = yield* Store.subscribeStream(query);

        return stream.pipe(
          Stream.map((world) => Option.fromNullable(world?.activeFrameId ?? null)),
        );
      }).pipe(Effect.orDie);

    const setActiveFrameId = (frameId: Id.Frame | null) =>
      Effect.gen(function* () {
        const { windowId, windowDoc } = yield* getWindowDoc();

        if (Option.isNone(windowDoc)) {
          return yield* Effect.fail(new WindowNotFoundError({ windowId }));
        }

        yield* Store.setDocument(
          "window",
          {
            ...windowDoc.value,
            activeRegion: "stage",
            activeFrameId: frameId,
          },
          windowId,
        ).pipe(Effect.orDie);
      }).pipe(Effect.orDie);

    const getActiveFrameId = () =>
      Effect.gen(function* () {
        const { windowDoc } = yield* getWindowDoc();

        if (Option.isNone(windowDoc)) return Option.none<Id.Frame>();

        if (windowDoc.value.activeFrameId != null) {
          return Option.some(windowDoc.value.activeFrameId);
        }

        const paneIds = windowDoc.value.panes;
        if (paneIds.length === 0) return Option.none<Id.Frame>();

        const paneDoc = yield* Store.getDocument("pane", paneIds[0]);
        if (Option.isNone(paneDoc)) return Option.none<Id.Frame>();

        const firstFrame = paneDoc.value.frames[0];
        if (firstFrame === undefined) return Option.none<Id.Frame>();

        return Option.some(firstFrame);
      }).pipe(Effect.orDie);

    return {
      subscribeActiveFrameId,
      setActiveFrameId,
      getActiveFrameId,
    };
  }),
);
