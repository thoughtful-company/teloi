import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";

/**
 * Find the previous message in chat tuple order.
 */
export const findPreviousNode = Effect.fn("View.chat.findPreviousNode")(
  function* (nodeId: Id.Node, frameId: Id.Frame) {
    return yield* resolveNeighbor(nodeId, frameId, -1);
  },
);

/**
 * Find the next message in chat tuple order.
 */
export const findNextNode = Effect.fn("View.chat.findNextNode")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
) {
  return yield* resolveNeighbor(nodeId, frameId, 1);
});

// ================================ Internal ==================================

const resolveNeighbor = Effect.fn("View.chat.resolveNeighbor")(function* (
  nodeId: Id.Node,
  frameId: Id.Frame,
  direction: -1 | 1,
) {
  const Store = yield* StoreT;
  const Tuple = yield* TupleT;

  const frameDoc = yield* Store.getDocument("frame", frameId);
  const chatNodeId = Option.isSome(frameDoc)
    ? (frameDoc.value.assignedNodeId as Id.Node | null)
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
});
