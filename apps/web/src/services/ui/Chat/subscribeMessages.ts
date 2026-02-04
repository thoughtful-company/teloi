import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { Effect, Stream } from "effect";
import { resolveEntries, type ChatMessageEntry } from "./types";

export const subscribeMessages = Effect.fn("subscribeMessages")(function* (
  chatNodeId: Id.Node,
) {
  const Tuple = yield* TupleT;
  const Type = yield* TypeT;

  const tuplesStream = yield* Tuple.subscribeByPosition(
    System.CHAT_HAS_MESSAGE,
    0,
    chatNodeId,
    1,
  );

  return tuplesStream.pipe(
    Stream.flatMap(
      (tuples) => {
        if (tuples.length === 0)
          return Stream.succeed<readonly ChatMessageEntry[]>([]);

        const messageNodeIds = tuples.map((t) => t.members[1]!);

        return Stream.unwrap(
          Effect.gen(function* () {
            const typeStreams = yield* Effect.all(
              messageNodeIds.map((id) => Type.subscribeTypes(id)),
            );
            return Stream.zipLatestAll(...typeStreams).pipe(
              Stream.map((allTypes) =>
                resolveEntries(messageNodeIds, allTypes),
              ),
            );
          }),
        );
      },
      { switch: true },
    ),
  );
});
