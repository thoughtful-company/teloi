import { Id, Model } from "@/schema";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";

export const setSelection = (
  bufferId: Id.Buffer,
  selection: Option.Option<Model.BufferSelection>,
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
        selection: Option.getOrNull(selection),
      },
      bufferId,
    ).pipe(Effect.orDie);

    yield* Effect.logDebug("[Buffer.setSelection] Selection updated").pipe(
      Effect.annotateLogs({
        bufferId,
        selection: Option.match(selection, {
          onNone: () => null,
          onSome: (s) => `${s.anchorBlockId}:${s.anchorOffset}-${s.focusBlockId}:${s.focusOffset}`,
        }),
      }),
    );
  });
