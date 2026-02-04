import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

export const resolveNeighbor = Effect.fn("ViewNavigation.resolveNeighbor")(
  function* (nodeId: Id.Node, bufferId: Id.Buffer, direction: -1 | 1) {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;

    const bufferDoc = yield* Store.getDocument("buffer", bufferId);
    const chatNodeId = Option.isSome(bufferDoc)
      ? (bufferDoc.value.assignedNodeId as Id.Node | null)
      : null;
    if (!chatNodeId) return Option.none<Id.Node>();

    const tuples = yield* Tuple.findByPosition(
      System.CHAT_HAS_MESSAGE,
      0,
      chatNodeId,
      1,
    );

    const idx = tuples.findIndex((t) => t.members[1] === nodeId);
    const neighborIdx = idx + direction;
    if (idx === -1 || neighborIdx < 0 || neighborIdx >= tuples.length)
      return Option.none<Id.Node>();

    return Option.some(tuples[neighborIdx]!.members[1]!);
  },
);
