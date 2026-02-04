import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { Effect } from "effect";
import { resolveEntries, type ChatMessage } from "./types";

export const getMessages = Effect.fn("getMessages")(function* (
  chatNodeId: Id.Node,
) {
  const Tuple = yield* TupleT;
  const Type = yield* TypeT;
  const Automerge = yield* AutomergeT;

  const tuples = yield* Tuple.findByPosition(
    System.CHAT_HAS_MESSAGE,
    0,
    chatNodeId,
    1,
  );

  const messageNodeIds = tuples.map((t) => t.members[1]!);
  const typesPerMessage = yield* Effect.all(
    messageNodeIds.map((id) => Type.getTypes(id)),
  );
  const entries = resolveEntries(messageNodeIds, typesPerMessage);

  return yield* Effect.all(
    entries.map((entry) =>
      Effect.map(
        Automerge.getText(entry.nodeId),
        (content): ChatMessage => ({ ...entry, content }),
      ),
    ),
  );
});
