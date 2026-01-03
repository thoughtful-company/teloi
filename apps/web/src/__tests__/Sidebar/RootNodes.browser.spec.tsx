import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Stream } from "effect";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { runtime } from "../bdd";

describe("Sidebar Root Nodes", () => {
  it("subscribeRootNodes returns nodes created without parentId", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;
        const Yjs = yield* YjsT;

        // Create a root node (no parentId)
        const rootNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: rootNodeId },
          }),
        );

        // Set some text so we can identify it
        const ytext = Yjs.getText(rootNodeId);
        ytext.insert(0, "My Root Page");

        // Subscribe to root nodes
        const rootNodesStream = yield* Node.subscribeRootNodes();

        // Get first emission
        const rootNodes = yield* rootNodesStream.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk][0]),
        );

        expect(rootNodes).toBeDefined();
        expect(rootNodes).toContain(rootNodeId);
      }),
    );
  });

  it("creates parent_links row with null parentId for root nodes", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;

        // Create a root node (no parentId)
        const rootNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: rootNodeId },
          }),
        );

        // Check that parent_links row was created
        const link = yield* Store.query(
          tables.parentLinks
            .select()
            .where({ childId: rootNodeId })
            .first({ fallback: () => null }),
        );

        expect(link).not.toBeNull();
        expect(link?.parentId).toBeNull();
      }),
    );
  });

  it("subscribeRootNodes does NOT return child nodes", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;

        // Create a root node
        const rootNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: rootNodeId },
          }),
        );

        // Create a child node under the root
        const childNodeId = yield* Node.insertNode({
          parentId: rootNodeId,
          insert: "before",
        });

        // Subscribe to root nodes
        const rootNodesStream = yield* Node.subscribeRootNodes();

        // Get first emission
        const rootNodes = yield* rootNodesStream.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk][0]),
        );

        expect(rootNodes).toContain(rootNodeId);
        expect(rootNodes).not.toContain(childNodeId);
      }),
    );
  });
});
