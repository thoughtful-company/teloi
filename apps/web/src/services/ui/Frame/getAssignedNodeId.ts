import { Id } from "@/schema";
import { Effect } from "effect";
import { NodeT } from "../../domain/Node";
import { FrameNodeNotAssignedError } from "../errors";
import { get } from "./get";

export const getAssignedNodeId = (frameId: Id.Frame) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;

    return yield* get(frameId, "assignedNodeId").pipe(
      Effect.filterOrFail(
        (id): id is Id.Node => id != null,
        () => new FrameNodeNotAssignedError({ frameId }),
      ),
      Effect.tap(Node.attestExistence),
    );
  });
