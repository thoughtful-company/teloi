import { Id, System } from "@/schema";
import * as IdT from "@/schema/id/id";
import { URLServiceB } from "@/services/browser/URLService";
import { NodeT } from "@/services/domain/Node";
import { Context, Effect, Layer, Option, Stream } from "effect";
import { FrameT } from "../Frame";
import { WorldT } from "../World";

const URL_SHORTCUTS: Record<string, Id.Node> = {
  "/inbox": System.INBOX,
  "/box": System.THE_BOX,
  "/calendar": System.CALENDAR,
  "/schema": System.SCHEMA,
};

const parseNodeIdFromPath = (path: string): Option.Option<Id.Node> => {
  // Check for URL shortcuts first
  const shortcutNodeId = URL_SHORTCUTS[path];
  if (shortcutNodeId !== undefined) {
    return Option.some(shortcutNodeId);
  }
  // Then check for /workspace/* pattern
  const match = path.match(/^\/workspace\/(.+)$/);
  return match && match[1]
    ? Option.some(Id.Node.make(match[1]))
    : Option.none();
};

const NODE_TO_PATH: Record<string, string> = {
  [System.INBOX]: "/inbox",
  [System.THE_BOX]: "/box",
  [System.CALENDAR]: "/calendar",
  [System.SCHEMA]: "/schema",
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
    const Frame = yield* FrameT;
    const Node = yield* NodeT;
    const World = yield* WorldT;

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

        const maybeFrameId = yield* World.getActiveFrameId();
        if (Option.isNone(maybeFrameId)) return;

        yield* Frame.setAssignedNodeId(maybeFrameId.value, nodeIdToUse);

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
                onNone: () =>
                  Effect.succeed(System.WORKSPACE as Id.Node | null),
                onSome: validateNodeId,
              });

              const maybeFrameId = yield* World.getActiveFrameId();
              if (Option.isNone(maybeFrameId)) return;

              const frameId = maybeFrameId.value;

              yield* Frame.setAssignedNodeId(frameId, validatedNodeId);

              // Restore frame/block focus based on current selection
              const selection = yield* Frame.getSelection(frameId).pipe(
                Effect.catchTag("FrameNotFoundError", () =>
                  Effect.succeed(Option.none<never>()),
                ),
              );

              if (Option.isSome(selection)) {
                const anchorBlockId = selection.value.khoraId;
                const selContext = yield* IdT.parseKhoraContext(
                  anchorBlockId,
                ).pipe(Effect.orDie);

                if (
                  selContext.type === "frame" &&
                  selContext.nodeId === validatedNodeId
                ) {
                  // Selection is on the title node (title is just a block)
                  const titleBlockId = Id.makeFrameKhoraId(
                    frameId,
                    validatedNodeId,
                  );
                  yield* Frame.enterBlockEditing(titleBlockId);
                  // Title scrolls itself or Frame handles it
                } else {
                  // Selection is on a block (frame or section block)
                  // Use the original khoraId from selection
                  yield* Frame.enterBlockEditing(anchorBlockId);
                  // Block scrolls itself on mount when editor mode becomes active
                }
              }

              yield* Effect.logDebug(
                "[Navigation.popstate] Updated frame from popstate",
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
        const maybeFrameId = yield* World.getActiveFrameId();
        if (Option.isNone(maybeFrameId)) return;

        const frameId = maybeFrameId.value;
        const validatedNodeId = nodeId ? yield* validateNodeId(nodeId) : null;

        yield* Frame.setAssignedNodeId(frameId, validatedNodeId);
        yield* URL.setPath(makePathFromNodeId(validatedNodeId));

        if (options?.focusTitle && validatedNodeId) {
          // Title is just a block
          const titleBlockId = Id.makeFrameKhoraId(frameId, validatedNodeId);
          yield* Frame.enterBlockEditing(titleBlockId);
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
