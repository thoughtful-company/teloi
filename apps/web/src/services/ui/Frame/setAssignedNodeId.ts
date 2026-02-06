import { Id } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { FrameNotFoundError } from "../errors";

export const setAssignedNodeId = (
  frameId: Id.Frame,
  nodeId: Id.Node | null,
): Effect.Effect<void, FrameNotFoundError, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const frameDoc = yield* Store.getDocument("frame", frameId).pipe(
      Effect.orDie,
    );

    if (Option.isNone(frameDoc)) {
      return yield* Effect.fail(new FrameNotFoundError({ frameId }));
    }

    const currentFrame = frameDoc.value;

    yield* Store.setDocument(
      "frame",
      {
        ...currentFrame,
        assignedNodeId: nodeId,
        activeViewId: null,
      },
      frameId,
    ).pipe(Effect.orDie);

    yield* Effect.logDebug("[Frame.setAssignedNodeId] Updated").pipe(
      Effect.annotateLogs({ frameId, nodeId }),
    );
  });
