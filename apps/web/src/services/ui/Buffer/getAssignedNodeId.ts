import { Id } from "@/schema";
import { Effect } from "effect";
import { NodeT } from "../../domain/Node";
import { BufferNodeNotAssignedError } from "../errors";
import { get } from "./get";

export const getAssignedNodeId = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    return yield* get(bufferId, "assignedNodeId").pipe(
      Effect.filterOrFail(
        (id): id is Id.Node => id != null,
        () => new BufferNodeNotAssignedError({ bufferId }),
      ),
      Effect.tap(Node.attestExistence),
    );
  });
