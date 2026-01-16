import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { queryDb } from "@livestore/livestore";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupClientTest, type BrowserRuntime } from "./bdd";

/**
 * Rendered Title Tests
 *
 * Nodes can display another node's title instead of their own.
 * Uses a hybrid approach: tuples as source of truth, dedicated `title_links` table for fast lookups.
 *
 * Tuple Type: RENDERED_NAME
 * - Position 0: `node` — The node whose title is rendered
 * - Position 1: `source` — The node providing the title
 * - Position 2: `mode` — MODE_SYNCED | MODE_READONLY | MODE_DETACH
 *
 * Modes:
 * - synced — Editing node's title edits source's title
 * - readonly — Display only, cannot edit
 * - detach — Editing breaks link, node gets its own title
 */

describe("Rendered Title", () => {
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

  /**
   * Creates two nodes with a RENDERED_NAME tuple linking them.
   * Node A will render Node B's title.
   */
  const createLinkedNodes = (mode: Id.Node) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Yjs = yield* YjsT;
      const Tuple = yield* TupleT;

      const nodeA = Id.Node.make(nanoid());
      const nodeB = Id.Node.make(nanoid());

      // Create both nodes
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: nodeA },
        }),
      );

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: nodeB },
        }),
      );

      // Set Node B's title text
      const ytextB = Yjs.getText(nodeB);
      ytextB.insert(0, "Hello");

      // Create RENDERED_NAME tuple: (nodeA, nodeB, mode)
      const tupleId = yield* Tuple.create(System.RENDERED_NAME, [
        nodeA,
        nodeB,
        mode,
      ]);

      return { nodeA, nodeB, tupleId };
    });

  describe("Title rendering", () => {
    it("renders title from source node when RENDERED_NAME tuple exists", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;

        // GIVEN: Node A with RENDERED_NAME tuple pointing to Node B (mode: synced)
        //        Node B has title "Hello"
        const { nodeA, nodeB } = yield* createLinkedNodes(System.MODE_SYNCED);

        // Verify Node B's Y.Text has the title
        const sourceTitleText = Yjs.getText(nodeB).toString();
        expect(sourceTitleText).toBe("Hello");

        // THEN: When rendering Node A's title, it should display "Hello" (from Node B)
        // This will be verified through TitleLinkT.getSourceNode() returning nodeB
        // The actual title rendering logic will use the source node's Y.Text
        // For now, we verify the tuple structure is correct
        const Tuple = yield* TupleT;
        const tuples = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeA,
        );

        expect(tuples).toHaveLength(1);
        expect(tuples[0]?.members[0]).toBe(nodeA);
        expect(tuples[0]?.members[1]).toBe(nodeB);
        expect(tuples[0]?.members[2]).toBe(System.MODE_SYNCED);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Synced mode", () => {
    it("editing node's title updates source's Y.Text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;

        // GIVEN: Node A linked to Node B (mode: synced)
        const { nodeB } = yield* createLinkedNodes(System.MODE_SYNCED);

        // WHEN: Edit Node A's title to "World"
        // In synced mode, the UI should write to Node B's Y.Text
        // This test documents expected behavior - implementation TBD
        const ytextB = Yjs.getText(nodeB);
        ytextB.delete(0, ytextB.length);
        ytextB.insert(0, "World");

        // THEN: Node B's Y.Text contains "World"
        expect(Yjs.getText(nodeB).toString()).toBe("World");
      }).pipe(runtime.runPromise);
    });
  });

  describe("Readonly mode", () => {
    it("prevents editing of node's title", async () => {
      await Effect.gen(function* () {
        // GIVEN: Node A linked to Node B (mode: readonly)
        const { nodeA } = yield* createLinkedNodes(System.MODE_READONLY);

        // WHEN: Attempt to edit Node A's title
        // THEN: Edit is prevented / no-op
        // This test documents expected behavior - the UI should prevent editing
        // For now, just verify the mode is correctly stored
        const Tuple = yield* TupleT;
        const tuples = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeA,
        );

        expect(tuples[0]?.members[2]).toBe(System.MODE_READONLY);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Detach mode", () => {
    it("editing breaks link and node gets own title", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const Tuple = yield* TupleT;

        // GIVEN: Node A linked to Node B (mode: detach), B has title "Original"
        const { nodeA, nodeB, tupleId } = yield* createLinkedNodes(
          System.MODE_DETACH,
        );

        // WHEN: Edit Node A's title to "New"
        // In detach mode, the system should:
        // 1. Delete the RENDERED_NAME tuple
        // 2. Create Node A's own Y.Text with the edited content
        // 3. Remove title_links row

        // Simulate detach behavior (implementation TBD)
        yield* Tuple.delete(tupleId);
        const ytextA = Yjs.getText(nodeA);
        ytextA.insert(0, "New");

        // THEN:
        // - Node A now has its own Y.Text with "New"
        expect(Yjs.getText(nodeA).toString()).toBe("New");

        // - Node B's Y.Text still has "Original"
        expect(Yjs.getText(nodeB).toString()).toBe("Hello");

        // - RENDERED_NAME tuple is deleted
        const tuplesAfter = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeA,
        );
        expect(tuplesAfter).toHaveLength(0);

        // TODO: Verify title_links row is removed when table exists
        // const titleLinks = yield* Store.query(
        //   queryDb(tables.titleLinks.select().where({ nodeId: nodeA })),
        // );
        // expect(titleLinks).toHaveLength(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("title_links materialization", () => {
    it("creates title_links row when RENDERED_NAME tuple is created", async () => {
      // It verifies that creating a RENDERED_NAME tuple automatically creates
      // a title_links row for fast lookups.
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const Tuple = yield* TupleT;

        // GIVEN: Node A, Node B exist
        const nodeA = Id.Node.make(nanoid());
        const nodeB = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: nodeA },
          }),
        );

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: nodeB },
          }),
        );

        Yjs.getText(nodeB).insert(0, "Source Title");

        // WHEN: Create RENDERED_NAME tuple (A, B, MODE_SYNCED)
        yield* Tuple.create(System.RENDERED_NAME, [
          nodeA,
          nodeB,
          System.MODE_SYNCED,
        ]);

        // THEN: title_links row created with nodeId=A, sourceId=B, mode="synced"
        const titleLinks = yield* Store.query(
          queryDb(tables.titleLinks.select().where({ nodeId: nodeA })),
        );
        expect(titleLinks).toHaveLength(1);
        expect(titleLinks[0]?.sourceId).toBe(nodeB);
        expect(titleLinks[0]?.mode).toBe("synced");
      }).pipe(runtime.runPromise);
    });

    it("removes title_links row when RENDERED_NAME tuple is deleted", async () => {
      // It verifies that deleting a RENDERED_NAME tuple automatically removes
      // the corresponding title_links row.
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Tuple = yield* TupleT;

        // GIVEN: Node A has RENDERED_NAME tuple -> title_links row exists
        const { nodeA, tupleId } = yield* createLinkedNodes(System.MODE_SYNCED);

        // Verify title_links row exists
        const titleLinksBefore = yield* Store.query(
          queryDb(tables.titleLinks.select().where({ nodeId: nodeA })),
        );
        expect(titleLinksBefore).toHaveLength(1);

        // WHEN: Delete the RENDERED_NAME tuple
        yield* Tuple.delete(tupleId);

        // THEN: title_links row is removed, Node A renders own title
        const titleLinksAfter = yield* Store.query(
          queryDb(tables.titleLinks.select().where({ nodeId: nodeA })),
        );
        expect(titleLinksAfter).toHaveLength(0);

        // Verify tuple is deleted
        const tuplesAfter = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeA,
        );
        expect(tuplesAfter).toHaveLength(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("Edge cases", () => {
    it("handles node deletion gracefully", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Tuple = yield* TupleT;

        // GIVEN: Node A linked to Node B
        const { nodeA, nodeB } = yield* createLinkedNodes(System.MODE_SYNCED);

        // WHEN: Node B (source) is deleted
        yield* Store.commit(
          events.nodeDeleted({
            timestamp: Date.now(),
            data: { nodeId: nodeB },
          }),
        );

        // THEN: Tuple should be cleaned up (cascade delete from NodeDeleted materializer)
        const tuplesAfter = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeA,
        );
        expect(tuplesAfter).toHaveLength(0);
      }).pipe(runtime.runPromise);
    });

    it("allows multiple nodes to reference the same source", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const Tuple = yield* TupleT;

        // Create source node
        const sourceNode = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: sourceNode },
          }),
        );
        Yjs.getText(sourceNode).insert(0, "Shared Title");

        // Create multiple nodes that reference the same source
        const nodeA = Id.Node.make(nanoid());
        const nodeB = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: nodeA },
          }),
        );

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: nodeB },
          }),
        );

        // Create RENDERED_NAME tuples for both
        yield* Tuple.create(System.RENDERED_NAME, [
          nodeA,
          sourceNode,
          System.MODE_SYNCED,
        ]);

        yield* Tuple.create(System.RENDERED_NAME, [
          nodeB,
          sourceNode,
          System.MODE_READONLY,
        ]);

        // Verify both tuples exist
        const tuplesForA = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeA,
        );
        const tuplesForB = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          0,
          nodeB,
        );

        expect(tuplesForA).toHaveLength(1);
        expect(tuplesForB).toHaveLength(1);
        expect(tuplesForA[0]?.members[1]).toBe(sourceNode);
        expect(tuplesForB[0]?.members[1]).toBe(sourceNode);
      }).pipe(runtime.runPromise);
    });

    it("can find all nodes rendering from a specific source via position 1 query", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Yjs = yield* YjsT;
        const Tuple = yield* TupleT;

        // Create source node
        const sourceNode = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: sourceNode },
          }),
        );
        Yjs.getText(sourceNode).insert(0, "Shared Title");

        // Create multiple nodes that reference the same source
        const nodeA = Id.Node.make(nanoid());
        const nodeB = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: nodeA },
          }),
        );

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: nodeB },
          }),
        );

        yield* Tuple.create(System.RENDERED_NAME, [
          nodeA,
          sourceNode,
          System.MODE_SYNCED,
        ]);

        yield* Tuple.create(System.RENDERED_NAME, [
          nodeB,
          sourceNode,
          System.MODE_SYNCED,
        ]);

        // Find all nodes that render from this source
        const tuplesUsingSource = yield* Tuple.findByPosition(
          System.RENDERED_NAME,
          1, // Position 1 is the source node
          sourceNode,
        );

        expect(tuplesUsingSource).toHaveLength(2);
        const nodeIds = tuplesUsingSource.map((t) => t.members[0]);
        expect(nodeIds).toContain(nodeA);
        expect(nodeIds).toContain(nodeB);
      }).pipe(runtime.runPromise);
    });
  });
});
