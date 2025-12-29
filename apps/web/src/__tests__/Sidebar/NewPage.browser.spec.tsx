import { tables } from "@/livestore/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";
import { runtime } from "../bdd";

describe("Sidebar New Page", () => {
  it("createRootNode creates a node with parentId = null", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;

        const nodeId = yield* Node.createRootNode();

        const link = yield* Store.query(
          tables.parentLinks
            .select()
            .where({ childId: nodeId })
            .first({ fallback: () => null }),
        );

        expect(link).not.toBeNull();
        expect(link?.parentId).toBeNull();
      }),
    );
  });

  it("createRootNode returns a node that appears in subscribeRootNodes", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Node = yield* NodeT;

        const nodeId = yield* Node.createRootNode();

        const rootNodesStream = yield* Node.subscribeRootNodes();
        const rootNodes = yield* rootNodesStream.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk][0]),
        );

        expect(rootNodes).toContain(nodeId);
      }),
    );
  });

  it("createRootNode positions new node after existing root nodes", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;

        const firstNodeId = yield* Node.createRootNode();
        const secondNodeId = yield* Node.createRootNode();

        const firstLink = yield* Store.query(
          tables.parentLinks
            .select()
            .where({ childId: firstNodeId })
            .first({ fallback: () => null }),
        );
        const secondLink = yield* Store.query(
          tables.parentLinks
            .select()
            .where({ childId: secondNodeId })
            .first({ fallback: () => null }),
        );

        expect(firstLink).not.toBeNull();
        expect(secondLink).not.toBeNull();
        expect(secondLink!.position > firstLink!.position).toBe(true);
      }),
    );
  });
});
