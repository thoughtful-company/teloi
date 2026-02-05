import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { Effect, Stream } from "effect";
import { resolveViewType, type ViewInfo } from "./types";

/**
 * Subscribe to view info for a node.
 * Emits a resolved list of ViewInfo (id, name, type) whenever HAS_VIEW tuples change.
 */
export const subscribeViewInfo = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Type = yield* TypeT;
    const Automerge = yield* AutomergeT;

    const hasViewStream = yield* Tuple.subscribeByPosition(
      System.HAS_VIEW,
      0,
      nodeId,
    );

    return hasViewStream.pipe(
      Stream.mapEffect((tuples) =>
        Effect.forEach(tuples, (tuple) => {
          const viewNodeId = tuple.members[1] as Id.Node;
          return Effect.gen(function* () {
            const typeIds = yield* Type.getTypes(viewNodeId);
            const name = (yield* Automerge.getText(viewNodeId)) || "View";
            return {
              id: viewNodeId,
              name,
              type: resolveViewType(typeIds),
            } satisfies ViewInfo;
          });
        }),
      ),
    );
  });
