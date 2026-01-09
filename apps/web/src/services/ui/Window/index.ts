import { tables } from "@/livestore/schema";
import { Entity, Id } from "@/schema";
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
    subscribeActiveElement: () => Effect.Effect<
      Stream.Stream<Option.Option<Entity.Element>>
    >;
    setActiveElement: (
      element: Option.Option<Entity.Element>,
    ) => Effect.Effect<void>;
    getActiveBufferId: () => Effect.Effect<Option.Option<Id.Buffer>>;
  }
>() {}

export const WindowLive = Layer.effect(
  WindowT,
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const subscribeActiveElement = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);

        const query = queryDb(
          tables.window
            .select("value")
            .where("id", "=", windowId)
            .first({ fallback: () => null }),
          { label: `window-activeElement-${windowId}`, deps: [windowId] },
        );

        const stream = yield* Store.subscribeStream(query);

        return stream.pipe(
          Stream.map((window) => Option.fromNullable(window?.activeElement)),
        );
      }).pipe(Effect.orDie);

    const setActiveElement = (element: Option.Option<Entity.Element>) =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);

        const windowDoc = yield* Store.getDocument("window", windowId);

        if (Option.isNone(windowDoc)) {
          return yield* Effect.fail(new WindowNotFoundError({ windowId }));
        }

        const currentWindow = windowDoc.value;
        const newActiveElement = Option.getOrNull(element);

        if (currentWindow.activeElement === newActiveElement) {
          return;
        }

        yield* Store.setDocument(
          "window",
          {
            ...currentWindow,
            activeElement: newActiveElement,
          },
          windowId,
        );
      }).pipe(Effect.orDie);

    const getActiveBufferId = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);
        const windowDoc = yield* Store.getDocument("window", windowId);

        if (Option.isNone(windowDoc)) return Option.none<Id.Buffer>();

        const paneIds = windowDoc.value.panes;
        if (paneIds.length === 0) return Option.none<Id.Buffer>();

        const paneDoc = yield* Store.getDocument("pane", paneIds[0]);
        if (Option.isNone(paneDoc)) return Option.none<Id.Buffer>();

        const firstBuffer = paneDoc.value.buffers[0];
        if (firstBuffer === undefined) return Option.none<Id.Buffer>();

        return Option.some(firstBuffer);
      }).pipe(Effect.orDie);

    return {
      subscribeActiveElement,
      setActiveElement,
      getActiveBufferId,
    };
  }),
);
