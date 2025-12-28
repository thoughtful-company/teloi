import { tables, TeloiNode } from "@/livestore/schema";
import { Id } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { NodeNotFoundError } from "../errors";

export const get = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const node = yield* Store.query(
      queryDb(
        tables.nodes.select().where({ id: nodeId }).first({ fallback: () => null }),
      ),
    );

    if (node === null) {
      return yield* Effect.fail(new NodeNotFoundError({ nodeId }));
    }

    return node as TeloiNode;
  });
