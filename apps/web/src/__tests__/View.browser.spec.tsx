import "@/index.css";
import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { ViewT } from "@/services/ui/View";
import { queryDb } from "@livestore/livestore";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupClientTest, type BrowserRuntime } from "./bdd";

/**
 * View Service Tests
 *
 * Views are shadow children of pages that define alternate rendering modes.
 * They are linked via HAS_VIEW tuples and tracked per-buffer via activeViewId.
 */

describe("ViewT", () => {
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

  /** Creates a page node for testing */
  const createPage = () =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const pageId = Id.Node.make(nanoid());

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: pageId },
        }),
      );

      return pageId;
    });

  /** Creates a buffer document for testing */
  const createBuffer = (windowId: Id.Window, paneId: Id.Pane) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const bufferId = Id.Buffer.make(nanoid());

      yield* Store.commit(
        events.buffer(
          {
            windowId,
            parent: { type: "pane", id: paneId },
            assignedNodeId: null,
            selectedBlocks: [],
            blockSelectionAnchor: null,
            blockSelectionFocus: null,
            lastFocusedBlockId: null,
            toggledNodes: [],
            selection: null,
            activeViewId: null,
          },
          bufferId,
        ),
      );

      return bufferId;
    });

  /** Sets activeViewId on a buffer */
  const setBufferActiveView = (bufferId: Id.Buffer, viewId: Id.Node | null) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;

      const bufferOpt = yield* Store.getDocument("buffer", bufferId);

      if (Option.isSome(bufferOpt)) {
        yield* Store.setDocument(
          "buffer",
          { ...bufferOpt.value, activeViewId: viewId },
          bufferId,
        );
      }
    });

  describe("getViewsForPage", () => {
    it("returns empty array when no views exist for page", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const pageId = yield* createPage();

        const views = yield* View.getViewsForPage(pageId);

        expect(views).toEqual([]);
      }).pipe(runtime.runPromise);
    });

    it("returns view IDs when HAS_VIEW tuples exist", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Tuple = yield* TupleT;
        const View = yield* ViewT;
        const pageId = yield* createPage();

        // Manually create view nodes and link them
        const viewId1 = Id.Node.make(nanoid());
        const viewId2 = Id.Node.make(nanoid());

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: viewId1, parentId: pageId, position: "" },
          }),
        );
        yield* Store.commit(
          events.nodeMoved({
            timestamp: Date.now(),
            data: { nodeId: viewId1, newParentId: pageId, position: "", inShadow: true },
          }),
        );

        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: viewId2, parentId: pageId, position: "" },
          }),
        );
        yield* Store.commit(
          events.nodeMoved({
            timestamp: Date.now(),
            data: { nodeId: viewId2, newParentId: pageId, position: "", inShadow: true },
          }),
        );

        // Create HAS_VIEW tuples
        yield* Tuple.create(System.HAS_VIEW, [pageId, viewId1]);
        yield* Tuple.create(System.HAS_VIEW, [pageId, viewId2]);

        const views = yield* View.getViewsForPage(pageId);

        expect(views).toHaveLength(2);
        expect(views).toContain(viewId1);
        expect(views).toContain(viewId2);
      }).pipe(runtime.runPromise);
    });
  });

  describe("getOrCreateView", () => {
    it("creates view node as shadow child with inShadow: true and position: ''", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const View = yield* ViewT;
        const pageId = yield* createPage();

        const viewId = yield* View.getOrCreateView(pageId);

        // Verify node exists
        const node = yield* Store.query(
          queryDb(tables.nodes.select().where({ id: viewId }).first()),
        );
        expect(node).toBeDefined();

        // Verify parent link has inShadow: true and position: ""
        const link = yield* Store.query(
          queryDb(tables.parentLinks.select().where({ childId: viewId }).first()),
        );
        expect(link).toBeDefined();
        expect(link!.parentId).toBe(pageId);
        expect(link!.inShadow).toBe(true);
        expect(link!.position).toBe("");
      }).pipe(runtime.runPromise);
    });

    it("creates HAS_VIEW tuple linking page to view", async () => {
      await Effect.gen(function* () {
        const Tuple = yield* TupleT;
        const View = yield* ViewT;
        const pageId = yield* createPage();

        const viewId = yield* View.getOrCreateView(pageId);

        // Verify HAS_VIEW tuple exists
        const tuples = yield* Tuple.findByPosition(System.HAS_VIEW, 0, pageId);
        expect(tuples).toHaveLength(1);
        const tuple = tuples[0];
        expect(tuple).toBeDefined();
        expect(tuple!.members[0]).toBe(pageId);
        expect(tuple!.members[1]).toBe(viewId);
      }).pipe(runtime.runPromise);
    });

    it("returns existing view if one already exists (idempotent)", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const pageId = yield* createPage();

        const viewId1 = yield* View.getOrCreateView(pageId);
        const viewId2 = yield* View.getOrCreateView(pageId);

        expect(viewId2).toBe(viewId1);

        // Verify only one view exists
        const views = yield* View.getViewsForPage(pageId);
        expect(views).toHaveLength(1);
      }).pipe(runtime.runPromise);
    });

    it("view is excluded from getNodeChildren results", async () => {
      await Effect.gen(function* () {
        const Store = yield* StoreT;
        const Node = yield* NodeT;
        const View = yield* ViewT;
        const pageId = yield* createPage();

        // Add a visible child
        const childId = Id.Node.make(nanoid());
        yield* Store.commit(
          events.nodeCreated({
            timestamp: Date.now(),
            data: { nodeId: childId, parentId: pageId, position: "a0" },
          }),
        );

        // Create view (shadow child)
        const viewId = yield* View.getOrCreateView(pageId);

        // Get visible children
        const children = yield* Node.getNodeChildren(pageId);

        expect(children).toContain(childId);
        expect(children).not.toContain(viewId);
        expect(children).toHaveLength(1);
      }).pipe(runtime.runPromise);
    });
  });

  describe("getActiveView", () => {
    it("returns Option.none() when buffer has no activeViewId", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const windowId = Id.Window.make(nanoid());
        const paneId = Id.Pane.make(nanoid());
        const bufferId = yield* createBuffer(windowId, paneId);

        const activeView = yield* View.getActiveView(bufferId);

        expect(Option.isNone(activeView)).toBe(true);
      }).pipe(runtime.runPromise);
    });

    it("returns Option.some(viewId) when activeViewId is set", async () => {
      await Effect.gen(function* () {
        const View = yield* ViewT;
        const windowId = Id.Window.make(nanoid());
        const paneId = Id.Pane.make(nanoid());
        const bufferId = yield* createBuffer(windowId, paneId);
        const pageId = yield* createPage();
        const viewId = yield* View.getOrCreateView(pageId);

        // Set active view on buffer
        yield* setBufferActiveView(bufferId, viewId);

        const activeView = yield* View.getActiveView(bufferId);

        expect(Option.isSome(activeView)).toBe(true);
        if (Option.isSome(activeView)) {
          expect(activeView.value).toBe(viewId);
        }
      }).pipe(runtime.runPromise);
    });
  });
});
