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
    getActiveElement: () => Effect.Effect<Option.Option<Entity.Element>>;
    getActiveFrameId: () => Effect.Effect<Option.Option<Id.Frame>>;
  }
>() {}

export const WindowLive = Layer.effect(
  WindowT,
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const resolveFrameIdFromElement = (element: Entity.Element) =>
      Effect.gen(function* () {
        switch (element.type) {
          case "frame":
            return Option.some(element.id);
          case "block": {
            const context = yield* Id.parseBlockContext(element.id).pipe(
              Effect.orDie,
            );
            return Option.some(context.frameId);
          }
          case "title":
          case "property":
            return Option.some(element.frameId);
          default:
            return Option.none<Id.Frame>();
        }
      });

    const getFrameDoc = (frameId: Id.Frame) =>
      Store.getDocument("frame", frameId).pipe(Effect.orDie);

    const getWindowDoc = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const windowId = Id.Window.make(sessionId);
        const windowDoc = yield* Store.getDocument("window", windowId).pipe(
          Effect.orDie,
        );
        return { windowId, windowDoc };
      });

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
          Stream.mapEffect(() => getActiveElement()),
        );
      }).pipe(Effect.orDie);

    const setActiveElement = (element: Option.Option<Entity.Element>) =>
      Effect.gen(function* () {
        const { windowId, windowDoc } = yield* getWindowDoc();

        if (Option.isNone(windowDoc)) {
          return yield* Effect.fail(new WindowNotFoundError({ windowId }));
        }

        const currentWindow = windowDoc.value;
        const maybeTargetFrameId = yield* Option.match(element, {
          onNone: () => Effect.succeed(Option.none<Id.Frame>()),
          onSome: resolveFrameIdFromElement,
        });

        const nextActiveFrameId = Option.match(maybeTargetFrameId, {
          onNone: () => (Option.isNone(element) ? null : currentWindow.activeFrameId),
          onSome: (frameId) => frameId,
        });

        if (Option.isSome(element) && Option.isSome(maybeTargetFrameId)) {
          const frameId = maybeTargetFrameId.value;
          const frameDoc = yield* getFrameDoc(frameId);
          if (Option.isSome(frameDoc)) {
            const frame = frameDoc.value;
            const rootNodeId = frame.rootBlockId ?? frame.assignedNodeId;
            const rootBlockId =
              rootNodeId != null
                ? Id.makeFrameBlockId(frameId, Id.Node.make(rootNodeId))
                : null;
            const selectedFocusBlockId =
              frame.blockSelectionFocus != null
                ? Id.makeFrameBlockId(frameId, frame.blockSelectionFocus)
                : null;

            const frameUpdate = (() => {
              const focused = element.value;
              switch (focused.type) {
                case "block":
                  return {
                    ...frame,
                    activeBlockId: focused.id,
                    activePart:
                      rootBlockId != null && focused.id === rootBlockId
                        ? ("head" as const)
                        : ("body" as const),
                  };
                case "title":
                  if (rootBlockId == null) return frame;
                  return {
                    ...frame,
                    activeBlockId: rootBlockId,
                    activePart: "head" as const,
                  };
                case "property":
                  return {
                    ...frame,
                    activeBlockId: null,
                    activePart: "body" as const,
                  };
                case "frame":
                  return {
                    ...frame,
                    activeBlockId: selectedFocusBlockId,
                    activePart: "body" as const,
                  };
                default:
                  return frame;
              }
            })();

            yield* Store.setDocument("frame", frameUpdate, frameId).pipe(
              Effect.orDie,
            );
          }
        }

        // Hard cutover: window no longer mirrors active element / text selection.
        // It only tracks active region and active frame.
        yield* Store.setDocument(
          "window",
          {
            ...currentWindow,
            activeRegion: "stage",
            activeFrameId: nextActiveFrameId,
          },
          windowId,
        ).pipe(Effect.orDie);
      }).pipe(Effect.orDie);

    const getActiveElement = () =>
      Effect.gen(function* () {
        const { windowDoc } = yield* getWindowDoc();

        if (Option.isNone(windowDoc)) return Option.none<Entity.Element>();

        const world = windowDoc.value;
        if ((world.activeRegion ?? "stage") !== "stage") {
          return Option.none<Entity.Element>();
        }
        if (world.activeFrameId == null) {
          return Option.none<Entity.Element>();
        }

        const frameDoc = yield* getFrameDoc(world.activeFrameId);
        if (Option.isNone(frameDoc)) {
          return Option.none<Entity.Element>();
        }

        const frame = frameDoc.value;
        if ((frame.selectedBlocks ?? []).length > 0) {
          return Option.some({
            type: "frame" as const,
            id: world.activeFrameId,
          });
        }

        if (frame.activeBlockId != null) {
          return Option.some({
            type: "block" as const,
            id: frame.activeBlockId,
          });
        }

        return Option.some({
          type: "frame" as const,
          id: world.activeFrameId,
        });
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
      subscribeActiveElement,
      setActiveElement,
      getActiveElement,
      getActiveFrameId,
    };
  }),
);
