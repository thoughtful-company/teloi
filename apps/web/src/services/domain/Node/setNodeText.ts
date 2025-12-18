import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { NodeNotFoundError } from "../errors";

export const setNodeText = (nodeId: Id.Node, textContent: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const query = queryDb(
      tables.nodes
        .select("textContent")
        .where({ id: nodeId })
        .first({ fallback: () => null }),
    );

    const currentText = yield* Store.query(query);

    if (currentText === null) {
      return yield* Effect.fail(new NodeNotFoundError({ nodeId }));
    }

    // Skip if text unchanged
    if (currentText === textContent) {
      return;
    }

    yield* Store.commit(
      events.nodeTextUpdated({
        timestamp: Date.now(),
        data: {
          nodeId,
          textContent,
        },
      }),
    );
  });
