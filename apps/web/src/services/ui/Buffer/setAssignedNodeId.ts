import { Id } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";

export const setAssignedNodeId = (
  bufferId: Id.Buffer,
  nodeId: Id.Node | null,
): Effect.Effect<void, BufferNotFoundError, StoreT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
      Effect.orDie,
    );

    if (Option.isNone(bufferDoc)) {
      return yield* Effect.fail(new BufferNotFoundError({ bufferId }));
    }

    const currentBuffer = bufferDoc.value;

    yield* Store.setDocument(
      "buffer",
      {
        ...currentBuffer,
        assignedNodeId: nodeId,
      },
      bufferId,
    ).pipe(Effect.orDie);

    yield* Effect.logDebug("[Buffer.setAssignedNodeId] Updated").pipe(
      Effect.annotateLogs({ bufferId, nodeId }),
    );
  });
