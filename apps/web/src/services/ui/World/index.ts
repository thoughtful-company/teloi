import { tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Context, Data, Effect, Layer, Option, Stream } from "effect";

export class WorldNotFoundError extends Data.TaggedError(
  "WorldNotFoundError",
)<{
  worldId: string;
}> {}

export class WorldT extends Context.Tag("WorldT")<
  WorldT,
  {
    subscribeActiveFrameId: () => Effect.Effect<
      Stream.Stream<Option.Option<Id.Frame>>
    >;
    setActiveFrameId: (frameId: Id.Frame | null) => Effect.Effect<void>;
    getActiveFrameId: () => Effect.Effect<Option.Option<Id.Frame>>;
  }
>() {}

export const WorldLive = Layer.effect(
  WorldT,
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const getWorldDoc = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const worldId = Id.World.make(sessionId);
        const worldDoc = yield* Store.getDocument("world", worldId).pipe(
          Effect.orDie,
        );
        return { worldId, worldDoc };
      });

    const subscribeActiveFrameId = () =>
      Effect.gen(function* () {
        const sessionId = yield* Store.getSessionId();
        const worldId = Id.World.make(sessionId);

        const query = queryDb(
          tables.world
            .select("value")
            .where("id", "=", worldId)
            .first({ fallback: () => null }),
          { label: `world-activeFrame-${worldId}`, deps: [worldId] },
        );

        const stream = yield* Store.subscribeStream(query);

        return stream.pipe(
          Stream.map((world) => Option.fromNullable(world?.activeFrameId ?? null)),
        );
      }).pipe(Effect.orDie);

    const setActiveFrameId = (frameId: Id.Frame | null) =>
      Effect.gen(function* () {
        const { worldId, worldDoc } = yield* getWorldDoc();

        if (Option.isNone(worldDoc)) {
          return yield* Effect.fail(new WorldNotFoundError({ worldId }));
        }

        yield* Store.setDocument(
          "world",
          {
            ...worldDoc.value,
            activeRegion: "stage",
            activeFrameId: frameId,
          },
          worldId,
        ).pipe(Effect.orDie);
      }).pipe(Effect.orDie);

    const getActiveFrameId = () =>
      Effect.gen(function* () {
        const { worldDoc } = yield* getWorldDoc();

        if (Option.isNone(worldDoc)) return Option.none<Id.Frame>();

        if (worldDoc.value.activeFrameId != null) {
          return Option.some(worldDoc.value.activeFrameId);
        }

        const paneIds = worldDoc.value.panes;
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

/** @deprecated Use WorldNotFoundError */
export const WindowNotFoundError = WorldNotFoundError;
/** @deprecated Use WorldT */
export const WindowT = WorldT;
/** @deprecated Use WorldLive */
export const WindowLive = WorldLive;
