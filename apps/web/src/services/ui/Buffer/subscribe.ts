import { tables, TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Option, Stream } from "effect";
import { NodeT } from "../../domain/Node";

export interface BufferView {
  nodeData: TeloiNode;
  childBlockIds: readonly string[];
}

export const subscribe = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    // Subscribe to buffer document to watch for assignedNodeId changes
    // Using exact same query pattern as Block/subscribe's selection stream
    const bufferQuery = queryDb(
      tables.buffer
        .select("value")
        .where("id", "=", bufferId)
        .first({ fallback: () => null }),
    );
    const bufferStream = yield* Store.subscribeStream(bufferQuery).pipe(
      Effect.orDie,
    );

    // Extract assignedNodeId from buffer, filter out nulls
    // Use changesWith for proper deduplication after filterMap
    const assignedNodeIdStream = bufferStream.pipe(
      Stream.map((buffer) => buffer?.assignedNodeId ?? null),
      Stream.filterMap((nodeId) =>
        nodeId != null ? Option.some(nodeId as Id.Node) : Option.none(),
      ),
      Stream.changesWith((a, b) => a === b),
    );

    // For each assignedNodeId, create streams for the node and its children
    // switch: true ensures we cancel the old stream when assignedNodeId changes
    return Stream.flatMap(
      assignedNodeIdStream,
      (nodeId) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const nodeStream = yield* Node.subscribe(nodeId);
            const childrenStream = yield* Node.subscribeChildren(nodeId);

            return Stream.zipLatestWith(
              nodeStream,
              childrenStream,
              (nodeData, childBlockIds) => ({ nodeData, childBlockIds }),
            );
          }),
        ),
      { switch: true },
    );
  });
