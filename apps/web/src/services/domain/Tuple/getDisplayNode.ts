import { Id } from "@/schema";
import { Effect, Option } from "effect";
import { get } from "./get";
import { TupleNotFoundError } from "./types";

export const getDisplayNode = (tupleId: Id.Tuple, hostNodeId: Id.Node) =>
  Effect.gen(function* () {
    const maybeTuple = yield* get(tupleId);
    if (Option.isNone(maybeTuple)) {
      return yield* Effect.fail(new TupleNotFoundError({ tupleId }));
    }
    const displayNode = maybeTuple.value.members.find((m) => m !== hostNodeId);
    if (!displayNode) {
      return yield* Effect.die(
        new Error(
          `Tuple ${tupleId} has no member other than host ${hostNodeId}`,
        ),
      );
    }
    return displayNode;
  });
