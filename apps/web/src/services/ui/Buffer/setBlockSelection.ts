import { Id } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";

export const setBlockSelection = (
  bufferId: Id.Buffer,
  blocks: readonly Id.Node[],
  blockSelectionAnchor: Id.Node | null,
  blockSelectionFocus?: Id.Node | null,
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
    // Default focus to anchor if not provided
    const focus = blockSelectionFocus ?? blockSelectionAnchor;

    yield* Store.setDocument(
      "buffer",
      {
        ...currentBuffer,
        selectedBlocks: [...blocks],
        blockSelectionAnchor,
        blockSelectionFocus: blocks.length > 0 ? focus : null,
        lastFocusedBlockId: focus,
      },
      bufferId,
    ).pipe(Effect.orDie);

    yield* Effect.logDebug(
      "[Buffer.setBlockSelection] Block selection updated",
    ).pipe(
      Effect.annotateLogs({
        bufferId,
        selectedBlocks: blocks,
        blockSelectionAnchor,
        blockSelectionFocus: focus,
        lastFocusedBlockId: focus,
      }),
    );
  });
