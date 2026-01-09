import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect, Stream } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupClientTest, type BrowserRuntime } from "../bdd";

describe("Sidebar Workspace Pages", () => {
  let runtime: BrowserRuntime;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("subscribeRootNodes returns pages created under workspace", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;
        const Yjs = yield* YjsT;

        // Create a page under workspace
        const pageNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: {
              nodeId: pageNodeId,
              parentId: System.WORKSPACE,
              position: "a0",
            },
          }),
        );

        // Set some text so we can identify it
        const ytext = Yjs.getText(pageNodeId);
        ytext.insert(0, "My Page");

        // Subscribe to workspace pages
        const pagesStream = yield* Node.subscribeRootNodes();

        // Get first emission
        const pages = yield* pagesStream.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk][0]),
        );

        expect(pages).toBeDefined();
        expect(pages).toContain(pageNodeId);
      }),
    );
  });

  it("creates parent_links row with workspace parentId for pages", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;

        // Create a page under workspace
        const pageNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: {
              nodeId: pageNodeId,
              parentId: System.WORKSPACE,
              position: "a0",
            },
          }),
        );

        // Check that parent_links row was created with workspace as parent
        const link = yield* Store.query(
          tables.parentLinks
            .select()
            .where({ childId: pageNodeId })
            .first({ fallback: () => null }),
        );

        expect(link).not.toBeNull();
        expect(link?.parentId).toBe(System.WORKSPACE);
      }),
    );
  });

  it("subscribeRootNodes does NOT return nested children", async () => {
    await runtime.runPromise(
      Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;

        // Create a page under workspace
        const pageNodeId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: {
              nodeId: pageNodeId,
              parentId: System.WORKSPACE,
              position: "a0",
            },
          }),
        );

        // Create a child node under the page
        const childNodeId = yield* Node.insertNode({
          parentId: pageNodeId,
          insert: "before",
        });

        // Subscribe to workspace pages
        const pagesStream = yield* Node.subscribeRootNodes();

        // Get first emission
        const pages = yield* pagesStream.pipe(
          Stream.take(1),
          Stream.runCollect,
          Effect.map((chunk) => [...chunk][0]),
        );

        expect(pages).toContain(pageNodeId);
        expect(pages).not.toContain(childNodeId);
      }),
    );
  });
});
