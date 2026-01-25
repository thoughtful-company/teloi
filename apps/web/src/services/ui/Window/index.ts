import { tables } from "@/livestore/schema";
import { Entity, Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { delayByTimeout } from "@/utils/effect";
import { queryDb } from "@livestore/livestore";
import { Context, Data, Effect, Layer, Option, Stream } from "effect";

// ============================================================================
// Unsettled Active Element
// ============================================================================

/**
 * Branded type indicating an activeElement value that may arrive before
 * related state (like selection) has propagated through the system.
 *
 * Consumers that mount UI based on `isActive` should use `settleActiveElement`
 * to delay the stream, allowing selection state to catch up.
 *
 * Consumers that don't depend on selection timing can use the stream directly.
 */
export type UnsettledActiveElement = Option.Option<Entity.Element> & {
  readonly _brand: "UnsettledActiveElement";
};

/**
 * Settles an activeElement stream by delaying emissions via setTimeout(0).
 * Gives selection updates time to propagate before UI reacts (~4ms).
 */
export const settleActiveElement = (
  stream: Stream.Stream<UnsettledActiveElement>,
): Stream.Stream<Option.Option<Entity.Element>> =>
  delayByTimeout(stream) as Stream.Stream<Option.Option<Entity.Element>>;

export class WindowNotFoundError extends Data.TaggedError(
  "WindowNotFoundError",
)<{
  windowId: string;
}> {}

export class WindowT extends Context.Tag("WindowT")<
  WindowT,
  {
    /**
     * Subscribe to active element changes.
     *
     * ⚠️ TIMING: Returns `UnsettledActiveElement` - this stream may emit
     * before selection updates have propagated. Use `settleActiveElement()`
     * to delay if mounting UI that depends on selection state.
     */
    subscribeActiveElement: () => Effect.Effect<
      Stream.Stream<UnsettledActiveElement>
    >;
    setActiveElement: (
      element: Option.Option<Entity.Element>,
    ) => Effect.Effect<void>;
    getActiveElement: () => Effect.Effect<Option.Option<Entity.Element>>;
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
          Stream.map(
            (window) =>
              Option.fromNullable(
                window?.activeElement,
              ) as UnsettledActiveElement,
          ),
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

    const getActiveElement = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);
        const windowDoc = yield* Store.getDocument("window", windowId);

        if (Option.isNone(windowDoc)) return Option.none<Entity.Element>();

        return Option.fromNullable(windowDoc.value.activeElement);
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
      getActiveElement,
      getActiveBufferId,
    };
  }),
);
