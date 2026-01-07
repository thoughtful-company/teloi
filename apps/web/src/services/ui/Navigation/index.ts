import { Id, System } from "@/schema";
import { URLServiceB } from "@/services/browser/URLService";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { BufferT } from "../Buffer";
import { WindowT } from "../Window";

const URL_SHORTCUTS: Record<string, Id.Node> = {
  "/inbox": System.INBOX,
  "/box": System.THE_BOX,
  "/calendar": System.CALENDAR,
};

const parseNodeIdFromPath = (path: string): Option.Option<Id.Node> => {
  // Check for URL shortcuts first
  const shortcutNodeId = URL_SHORTCUTS[path];
  if (shortcutNodeId !== undefined) {
    return Option.some(shortcutNodeId);
  }
  // Then check for /workspace/* pattern
  const match = path.match(/^\/workspace\/(.+)$/);
  return match && match[1] ? Option.some(Id.Node.make(match[1])) : Option.none();
};

const NODE_TO_PATH: Record<string, string> = {
  [System.INBOX]: "/inbox",
  [System.THE_BOX]: "/box",
  [System.CALENDAR]: "/calendar",
};

const makePathFromNodeId = (nodeId: Id.Node | null): string => {
  if (nodeId === null || nodeId === System.WORKSPACE) {
    return "/workspace";
  }
  // Check for special shortcuts
  const shortcutPath = NODE_TO_PATH[nodeId];
  if (shortcutPath !== undefined) {
    return shortcutPath;
  }
  return `/workspace/${nodeId}`;
};

export class NavigationT extends Context.Tag("NavigationT")<
  NavigationT,
  {
    syncUrlToModel: () => Effect.Effect<void>;
    startPopstateListener: () => Effect.Effect<Stream.Stream<void>>;
    navigateTo: (
      nodeId: Id.Node | null,
      options?: { focusTitle?: boolean },
    ) => Effect.Effect<void>;
  }
>() {}

export const NavigationLive = Layer.effect(
  NavigationT,
  Effect.gen(function* () {
    const URL = yield* URLServiceB;
    const Store = yield* StoreT;
    const Buffer = yield* BufferT;
    const Node = yield* NodeT;
    const Window = yield* WindowT;

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

    const syncUrlToModel = () =>
      Effect.gen(function* () {
        const path = yield* URL.getPath();
        const maybeNodeId = parseNodeIdFromPath(path);

        let nodeIdToUse: Id.Node | null;

        if (Option.isSome(maybeNodeId)) {
          nodeIdToUse = yield* validateNodeId(maybeNodeId.value);
        } else {
          nodeIdToUse = System.WORKSPACE;
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
                onNone: () => Effect.succeed(System.WORKSPACE as Id.Node | null),
                onSome: validateNodeId,
              });

              const maybeBufferId = yield* getActiveBufferId;
              if (Option.isNone(maybeBufferId)) return;

              const bufferId = maybeBufferId.value as Id.Buffer;

              yield* Buffer.setAssignedNodeId(bufferId, validatedNodeId);

              // Restore activeElement based on current selection
              const selection = yield* Buffer.getSelection(bufferId).pipe(
                Effect.catchTag("BufferNotFoundError", () =>
                  Effect.succeed(Option.none<never>()),
                ),
              );

              if (Option.isSome(selection)) {
                const selNodeId = selection.value.anchor.nodeId;
                if (selNodeId === validatedNodeId) {
                  // Selection is on the title node
                  yield* Window.setActiveElement(
                    Option.some({ type: "title" as const, bufferId }),
                  );
                } else {
                  // Selection is on a block
                  const blockId = Id.makeBlockId(bufferId, selNodeId);
                  yield* Window.setActiveElement(
                    Option.some({ type: "block" as const, id: blockId }),
                  );
                }
              }

              yield* Effect.logDebug(
                "[Navigation.popstate] Updated buffer from popstate",
              ).pipe(Effect.annotateLogs({ path, nodeId: validatedNodeId }));
            }).pipe(Effect.orDie),
          ),
        );
      });

    const navigateTo = (
      nodeId: Id.Node | null,
      options?: { focusTitle?: boolean },
    ) =>
      Effect.gen(function* () {
        const maybeBufferId = yield* getActiveBufferId;
        if (Option.isNone(maybeBufferId)) return;

        const bufferId = maybeBufferId.value as Id.Buffer;
        const validatedNodeId = nodeId
          ? yield* validateNodeId(nodeId)
          : null;

        yield* Buffer.setAssignedNodeId(bufferId, validatedNodeId);
        yield* URL.setPath(makePathFromNodeId(validatedNodeId));

        if (options?.focusTitle) {
          yield* Window.setActiveElement(
            Option.some({ type: "title" as const, bufferId }),
          );
        }

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
