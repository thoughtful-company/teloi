import { Id } from "@/schema";
import { URLServiceB } from "@/services/browser/URLService";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { BufferT } from "../Buffer";

const parseNodeIdFromPath = (path: string): Option.Option<Id.Node> => {
  const match = path.match(/^\/workspace\/(.+)$/);
  return match && match[1] ? Option.some(Id.Node.make(match[1])) : Option.none();
};

const makePathFromNodeId = (nodeId: Id.Node | null): string =>
  nodeId ? `/workspace/${nodeId}` : "/workspace";

export class NavigationT extends Context.Tag("NavigationT")<
  NavigationT,
  {
    syncUrlToModel: (fallbackNodeId?: Id.Node) => Effect.Effect<void>;
    startPopstateListener: () => Effect.Effect<Stream.Stream<void>>;
    navigateTo: (nodeId: Id.Node | null) => Effect.Effect<void>;
  }
>() {}

export const NavigationLive = Layer.effect(
  NavigationT,
  Effect.gen(function* () {
    const URL = yield* URLServiceB;
    const Store = yield* StoreT;
    const Buffer = yield* BufferT;
    const Node = yield* NodeT;

    const getActiveBufferId = Effect.gen(function* () {
      const sessionId = yield* Store.getSessionId();
      const windowId = Id.Window.make(sessionId);
      const windowDoc = yield* Store.getDocument("window", windowId);

      if (Option.isNone(windowDoc)) return Option.none<Id.Buffer>();

      const paneIds = windowDoc.value.panes;
      if (paneIds.length === 0) return Option.none<Id.Buffer>();

      const paneDoc = yield* Store.getDocument("pane", paneIds[0]);
      if (Option.isNone(paneDoc) || paneDoc.value.buffers.length === 0) {
        return Option.none<Id.Buffer>();
      }

      return Option.some(paneDoc.value.buffers[0]);
    });

    const validateNodeId = (nodeId: Id.Node) =>
      Node.attestExistence(nodeId).pipe(
        Effect.map(() => nodeId as Id.Node | null),
        Effect.catchTag("NodeNotFoundError", () => Effect.succeed(null)),
      );

    const syncUrlToModel = (fallbackNodeId?: Id.Node) =>
      Effect.gen(function* () {
        const path = yield* URL.getPath();
        const maybeNodeId = parseNodeIdFromPath(path);

        let nodeIdToUse: Id.Node | null = null;

        if (Option.isSome(maybeNodeId)) {
          nodeIdToUse = yield* validateNodeId(maybeNodeId.value);
        }

        if (nodeIdToUse === null && fallbackNodeId) {
          nodeIdToUse = yield* validateNodeId(fallbackNodeId);
          if (nodeIdToUse !== null) {
            yield* URL.setPath(makePathFromNodeId(nodeIdToUse));
          }
        }

        const maybeBufferId = yield* getActiveBufferId;
        if (Option.isNone(maybeBufferId)) return;

        yield* Buffer.setAssignedNodeId(
          maybeBufferId.value as Id.Buffer,
          nodeIdToUse,
        );

        yield* Effect.logDebug("[Navigation.syncUrlToModel] Synced").pipe(
          Effect.annotateLogs({ path, nodeIdToUse }),
        );
      }).pipe(Effect.orDie);

    const startPopstateListener = () =>
      Effect.gen(function* () {
        const popstateStream = yield* URL.popstate();

        return popstateStream.pipe(
          Stream.mapEffect((path) =>
            Effect.gen(function* () {
              const maybeNodeId = parseNodeIdFromPath(path);
              const validatedNodeId = yield* Option.match(maybeNodeId, {
                onNone: () => Effect.succeed(null as Id.Node | null),
                onSome: validateNodeId,
              });

              const maybeBufferId = yield* getActiveBufferId;
              if (Option.isNone(maybeBufferId)) return;

              yield* Buffer.setAssignedNodeId(
                maybeBufferId.value as Id.Buffer,
                validatedNodeId,
              );

              yield* Effect.logDebug(
                "[Navigation.popstate] Updated buffer from popstate",
              ).pipe(Effect.annotateLogs({ path, nodeId: validatedNodeId }));
            }).pipe(Effect.orDie),
          ),
        );
      });

    const navigateTo = (nodeId: Id.Node | null) =>
      Effect.gen(function* () {
        const maybeBufferId = yield* getActiveBufferId;
        if (Option.isNone(maybeBufferId)) return;

        const validatedNodeId = nodeId
          ? yield* validateNodeId(nodeId)
          : null;

        yield* Buffer.setAssignedNodeId(
          maybeBufferId.value as Id.Buffer,
          validatedNodeId,
        );
        yield* URL.setPath(makePathFromNodeId(validatedNodeId));

        yield* Effect.logDebug("[Navigation.navigateTo] Navigated").pipe(
          Effect.annotateLogs({ nodeId: validatedNodeId }),
        );
      }).pipe(Effect.orDie);

    return {
      syncUrlToModel,
      startPopstateListener,
      navigateTo,
    };
  }),
);
