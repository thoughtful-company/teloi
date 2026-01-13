import { tables, TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Option, Stream } from "effect";
import { NodeT } from "../../domain/Node";

export interface BufferView {
  nodeData: TeloiNode;
  childBlockIds: readonly string[];
  activeViewId: Id.Node | null;
}

export const subscribe = (bufferId: Id.Buffer) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Node = yield* NodeT;

    // Subscribe to buffer document to watch for assignedNodeId and activeViewId changes
    const bufferQuery = queryDb(
      tables.buffer
        .select("value")
        .where("id", "=", bufferId)
        .first({ fallback: () => null }),
    );
    const bufferStream = yield* Store.subscribeStream(bufferQuery).pipe(
      Effect.orDie,
    );

    // Create a stream that emits {nodeId, activeViewId} pairs
    // Filter out cases where nodeId is null
    const bufferDataStream = bufferStream.pipe(
      Stream.map((buffer) => ({
        nodeId: buffer?.assignedNodeId ?? null,
        activeViewId: (buffer?.activeViewId as Id.Node | null) ?? null,
      })),
      Stream.filterMap(({ nodeId, activeViewId }) =>
        nodeId != null
          ? Option.some({ nodeId: nodeId as Id.Node, activeViewId })
          : Option.none(),
      ),
    );

    // For each buffer state, create streams for the node and its children
    // switch: true ensures we cancel the old stream when assignedNodeId changes
    return Stream.flatMap(
      bufferDataStream,
      ({ nodeId, activeViewId }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const nodeStream = yield* Node.subscribe(nodeId);
            const childrenStream = yield* Node.subscribeChildren(nodeId);

            return Stream.zipLatestWith(
              nodeStream,
              childrenStream,
              (nodeData, childBlockIds) => ({
                nodeData,
                childBlockIds,
                activeViewId,
              }),
            );
          }),
        ),
      { switch: true },
    );
  });
