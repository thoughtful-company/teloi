import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { StoreT } from "@/services/external/Store";
import { queryDb } from "@livestore/livestore";
import { Effect, Stream } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupClientTest, type BrowserRuntime } from "@/test-utils/bdd";

/**
 * Shadow Children Tests
 *
 * Shadow children are nodes that exist in the hierarchy but don't render as
 * page content. They are marked with:
 * - inShadow: true
 * - position: "" (preferred, no ordering among visible siblings)
 */

describe("Shadow Children", () => {
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

  /** Creates parent with: childA (light), childB (shadow), childC (light) */
  const createParentWithMixedChildren = () =>
    Effect.gen(function* () {
      const Store = yield* StoreT;

      const parentId = Id.Node.make(nanoid());
      const childA = Id.Node.make(nanoid());
      const childB = Id.Node.make(nanoid());
      const childC = Id.Node.make(nanoid());

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: parentId },
        }),
      );

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: childA, parentId, position: "a0" },
        }),
      );

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: childB, parentId, position: "a1" },
        }),
      );

      // Move childB to shadow
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId: childB,
            newParentId: parentId,
            position: "",
            inShadow: true,
          },
        }),
      );

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: childC, parentId, position: "a2" },
        }),
      );

      return { parentId, childA, childB, childC };
    });

  describe("getNodeChildren", () => {
    it("excludes shadow children from results", async () => {
      await Effect.gen(function* () {
        const Node = yield* NodeT;
        const { parentId, childA, childB, childC } =
          yield* createParentWithMixedChildren();

        const children = yield* Node.getNodeChildren(parentId);

        expect(children).toHaveLength(2);
        expect(children).toContain(childA);
        expect(children).not.toContain(childB);
        expect(children).toContain(childC);
        expect(children[0]).toBe(childA);
        expect(children[1]).toBe(childC);
      }).pipe(runtime.runPromise);
    });
  });

  describe("subscribeChildren", () => {
    it("stream excludes shadow children", async () => {
      await Effect.gen(function* () {
        const Node = yield* NodeT;
        const { parentId, childA, childB, childC } =
          yield* createParentWithMixedChildren();

        const childrenStream = yield* Node.subscribeChildren(parentId);
        const firstEmission = yield* childrenStream.pipe(Stream.runHead);

        expect(firstEmission._tag).toBe("Some");
        if (firstEmission._tag === "Some") {
          const children = firstEmission.value;
          expect(children).toHaveLength(2);
          expect(children).toContain(childA);
          expect(children).not.toContain(childB);
          expect(children).toContain(childC);
        }
      }).pipe(runtime.runPromise);
    });
  });

  describe("Position calculation", () => {
    it("skips shadow siblings when calculating insertion position", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;

        const parentId = Id.Node.make(nanoid());
        const childA = Id.Node.make(nanoid());
        const shadowChild = Id.Node.make(nanoid());
        const childC = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: parentId },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: childA, parentId, position: "a0" },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: shadowChild, parentId, position: "a1" },
          }),
        );
        yield* Store.commit(
          events.nodeMoved({
            timestamp: Date.now(),
            data: {
              nodeId: shadowChild,
              newParentId: parentId,
              position: "",
              inShadow: true,
            },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: childC, parentId, position: "a2" },
          }),
        );

        // Insert after A - shadow sibling should be skipped
        const newNodeId = yield* Node.insertNode({
          parentId,
          insert: "after",
          siblingId: childA,
        });

        const visibleChildren = yield* Node.getNodeChildren(parentId);
        expect(visibleChildren).toHaveLength(3);
        expect(visibleChildren[0]).toBe(childA);
        expect(visibleChildren[1]).toBe(newNodeId);
        expect(visibleChildren[2]).toBe(childC);

        const newLink = yield* Store.query(
          queryDb(
            tables.parentLinks.select().where({ childId: newNodeId }).first(),
          ),
        );
        expect(newLink.position > "a0").toBe(true);
        expect(newLink.position < "a2").toBe(true);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Deletion cascade", () => {
    it("includes shadow children when deleting parent (no orphans)", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;
        const { parentId, childA, childB, childC } =
          yield* createParentWithMixedChildren();

        const nodesBefore = yield* Store.query(queryDb(tables.nodes.select()));
        expect(nodesBefore.map((n) => n.id)).toContain(parentId);
        expect(nodesBefore.map((n) => n.id)).toContain(childB);

        yield* Node.deleteNode(parentId);

        // Shadow children must be deleted too (no orphans)
        const nodesAfter = yield* Store.query(queryDb(tables.nodes.select()));
        expect(nodesAfter.map((n) => n.id)).not.toContain(parentId);
        expect(nodesAfter.map((n) => n.id)).not.toContain(childA);
        expect(nodesAfter.map((n) => n.id)).not.toContain(childB);
        expect(nodesAfter.map((n) => n.id)).not.toContain(childC);

        const linksAfter = yield* Store.query(
          queryDb(tables.parentLinks.select()),
        );
        expect(linksAfter.map((l) => l.childId)).not.toContain(childA);
        expect(linksAfter.map((l) => l.childId)).not.toContain(childB);
        expect(linksAfter.map((l) => l.childId)).not.toContain(childC);
      }).pipe(runtime.runPromise);
    });

    it("deletes nested shadow children recursively", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;

        const parentId = Id.Node.make(nanoid());
        const shadowChild = Id.Node.make(nanoid());
        const grandchild = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: parentId },
          }),
        );
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: shadowChild, parentId, position: "a0" },
          }),
        );
        yield* Store.commit(
          events.nodeMoved({
            timestamp: Date.now(),
            data: {
              nodeId: shadowChild,
              newParentId: parentId,
              position: "",
              inShadow: true,
            },
          }),
        );
        // Grandchild under shadow child
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: grandchild, parentId: shadowChild, position: "a0" },
          }),
        );

        const nodesBefore = yield* Store.query(queryDb(tables.nodes.select()));
        expect(nodesBefore.map((n) => n.id)).toContain(shadowChild);
        expect(nodesBefore.map((n) => n.id)).toContain(grandchild);

        yield* Node.deleteNode(parentId);

        // Shadow child AND its children must be deleted
        const nodesAfter = yield* Store.query(queryDb(tables.nodes.select()));
        expect(nodesAfter.map((n) => n.id)).not.toContain(parentId);
        expect(nodesAfter.map((n) => n.id)).not.toContain(shadowChild);
        expect(nodesAfter.map((n) => n.id)).not.toContain(grandchild);
      }).pipe(runtime.runPromise);
    });
  });
});
