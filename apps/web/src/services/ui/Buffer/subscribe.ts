import { TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { Effect, Stream } from "effect";
import { NodeT } from "../../domain/Node";
import { getAssignedNodeId } from "./getAssignedNodeId";

export interface BufferView {
  nodeData: TeloiNode;
  childBlockIds: readonly string[];
}

export const subscribe = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const nodeId = yield* getAssignedNodeId(bufferId);

    const nodeStream = yield* Node.subscribe(nodeId);
    const childrenStream = yield* Node.subscribeChildren(nodeId);

    return Stream.zipLatestWith(
      nodeStream,
      childrenStream,
      (nodeData, childBlockIds) => ({ nodeData, childBlockIds }),
    );
  });
