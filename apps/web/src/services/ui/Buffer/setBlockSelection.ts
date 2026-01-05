import { Id } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";

export const setBlockSelection = (
  bufferId: Id.Buffer,
  blocks: readonly Id.Node[],
  lastFocusedBlockId: Id.Node,
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
        selectedBlocks: [...blocks],
        lastFocusedBlockId,
      },
      bufferId,
    ).pipe(Effect.orDie);

    yield* Effect.logDebug(
      "[Buffer.setBlockSelection] Block selection updated",
    ).pipe(
      Effect.annotateLogs({
        bufferId,
        selectedBlocks: blocks,
        lastFocusedBlockId,
      }),
    );
  });
