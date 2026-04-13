import "@/index.css";
import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { FrameT } from "@/services/ui/Frame";
import { PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import FrameView from "@/ui/FrameView";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";
import { doubleRaf } from "@/utils/effect";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { waitFor } from "solid-testing-library";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * ArrowRight on Property Title
 *
 * When cursor is at the END of a property title:
 * - Unbound property: quick-creates tuple type + linked block, focuses linked block
 * - Bound property with linked blocks: focuses first linked block
 * - Bound property with no linked blocks: creates linked block, focuses it
 *
 * When cursor is NOT at the end: normal cursor movement, no creation.
 */
describe("ArrowRight on property title", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  // ================================ Helpers ==================================

  /** Create a frame with an unbound property on its default view */
  const createUnboundProperty = (propertyName: string) =>
    Effect.gen(function* () {
      const Property = yield* PropertyT;
      const View = yield* ViewT;
      const Automerge = yield* AutomergeT;

      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Test Page", [{ text: "child" }]);

      const viewId = yield* View.getOrCreateView(rootNodeId);
      const propertyId = yield* Property.createProperty(viewId);
      yield* Automerge.setText(propertyId, propertyName);

      const titleKhoraId = Id.makePropertyTitleKhoraId(
        frameId,
        rootNodeId,
        propertyId,
      );

      return {
        frameId,
        rootNodeId,
        childNodeIds,
        viewId,
        propertyId,
        titleKhoraId,
      };
    });

  /**
   * Create a bound property (tuple type + binding, no linked blocks).
   * Mirrors quickCreateTupleType setup but uses stable low-level APIs
   * so the helper doesn't break when quickCreateTupleType changes.
   */
  const createBoundProperty = (propertyName: string) =>
    Effect.gen(function* () {
      const Property = yield* PropertyT;
      const Store = yield* StoreT;
      const Tuple = yield* TupleT;
      const Type = yield* TypeT;
      const Automerge = yield* AutomergeT;

      const base = yield* createUnboundProperty(propertyName);

      // Create tuple type as shadow child of SCHEMA
      const tupleTypeId = Id.Node.make(nanoid());
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: tupleTypeId },
        }),
      );
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId: tupleTypeId,
            newParentId: System.SCHEMA,
            position: "",
            inShadow: true,
          },
        }),
      );
      yield* Automerge.setText(tupleTypeId, `${propertyName}_Tuple`);
      yield* Type.addType(tupleTypeId, System.TUPLE_TYPE);

      // Position 0 node
      const pos0Id = Id.Node.make(nanoid());
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: pos0Id },
        }),
      );
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId: pos0Id,
            newParentId: tupleTypeId,
            position: "a0",
            inShadow: true,
          },
        }),
      );

      // Position 1 node
      const pos1Id = Id.Node.make(nanoid());
      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: pos1Id },
        }),
      );
      yield* Store.commit(
        events.nodeMoved({
          timestamp: Date.now(),
          data: {
            nodeId: pos1Id,
            newParentId: tupleTypeId,
            position: "a1",
            inShadow: true,
          },
        }),
      );

      // Roles (required for Tuple.create)
      yield* Tuple.addRole(tupleTypeId, 0, propertyName, true);
      yield* Tuple.addRole(tupleTypeId, 1, `Is ${propertyName} For`, true);

      // Bind property
      yield* Property.bindToTupleType(base.propertyId, tupleTypeId, 1, 0);

      return { ...base, tupleTypeId };
    });

  /** Wait for property section to appear in DOM */
  const waitForPropertySection = () =>
    Effect.promise(() =>
      waitFor(
        () => {
          const el = document.querySelector("[data-testid='property-section']");
          expect(el).toBeTruthy();
        },
        { timeout: 3000 },
      ),
    );

  /** Focus property title at the end of its text */
  const focusPropertyTitleAtEnd = (
    titleKhoraId: Id.Khora,
    propertyId: Id.Node,
  ) =>
    Effect.gen(function* () {
      const Automerge = yield* AutomergeT;
      const text = yield* Automerge.getText(propertyId);
      yield* Given.KHORA_IS_FOCUSED_AT(titleKhoraId, text.length);
      yield* Effect.promise(() =>
        waitFor(
          () => {
            const cm = document.querySelector(
              ".property-name .cm-editor.cm-focused",
            );
            expect(cm).toBeTruthy();
          },
          { timeout: 2000 },
        ),
      );
    });

  // ================================ Tests ====================================

  describe("at end of unbound property", () => {
    it("creates tuple type and linked block, focuses linked block", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { frameId, rootNodeId, propertyId, viewId, titleKhoraId } =
          yield* createUnboundProperty("Priority");

        render(() => <FrameView frameId={frameId} />);
        yield* waitForPropertySection();
        yield* focusPropertyTitleAtEnd(titleKhoraId, propertyId);

        yield* When.USER_PRESSES("{ArrowRight}");

        // Property becomes bound with correct positions
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const props = await Property.getPropertiesForView(viewId).pipe(
                runtime.runPromise,
              );
              const prop = props.find((p) => p.id === propertyId);
              expect(prop?.isBound).toBe(true);
              expect(prop?.hostPosition).toBe(1);
              expect(prop?.displayPosition).toBe(0);
            },
            { timeout: 3000 },
          ),
        );

        // Exactly one linked block exists, and it is focused
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const tuples = await Property.getLinkedTuples(
                propertyId,
                rootNodeId,
              ).pipe(runtime.runPromise);
              expect(tuples).toHaveLength(1);

              const expectedKhoraId = Id.makePropertyKhoraId(
                frameId,
                rootNodeId,
                propertyId,
                tuples[0]!.tupleId,
              );
              const mode = await Effect.gen(function* () {
                const Frame = yield* FrameT;
                return yield* Frame.getMode();
              }).pipe(runtime.runPromise);
              expect(mode).toEqual({
                type: "khora",
                khoraId: expectedKhoraId,
              });
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("at end of bound property with linked blocks", () => {
    it("focuses first linked block without creating new ones", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { frameId, rootNodeId, propertyId, titleKhoraId } =
          yield* createBoundProperty("Status");

        // Create two linked blocks before rendering
        yield* Property.addLinkedBlock(propertyId, rootNodeId);
        yield* Property.addLinkedBlock(propertyId, rootNodeId);

        const tuplesBefore = yield* Property.getLinkedTuples(
          propertyId,
          rootNodeId,
        );
        expect(tuplesBefore).toHaveLength(2);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForPropertySection();
        yield* focusPropertyTitleAtEnd(titleKhoraId, propertyId);

        yield* When.USER_PRESSES("{ArrowRight}");

        // No new linked blocks, focus on first one
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const tuplesAfter = await Property.getLinkedTuples(
                propertyId,
                rootNodeId,
              ).pipe(runtime.runPromise);
              expect(tuplesAfter).toHaveLength(2);

              const expectedKhoraId = Id.makePropertyKhoraId(
                frameId,
                rootNodeId,
                propertyId,
                tuplesAfter[0]!.tupleId,
              );
              const mode = await Effect.gen(function* () {
                const Frame = yield* FrameT;
                return yield* Frame.getMode();
              }).pipe(runtime.runPromise);
              expect(mode).toEqual({
                type: "khora",
                khoraId: expectedKhoraId,
              });
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("at end of bound property with no linked blocks", () => {
    it("creates linked block and focuses it", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { frameId, rootNodeId, propertyId, titleKhoraId } =
          yield* createBoundProperty("Tags");

        const tuplesBefore = yield* Property.getLinkedTuples(
          propertyId,
          rootNodeId,
        );
        expect(tuplesBefore).toHaveLength(0);

        render(() => <FrameView frameId={frameId} />);
        yield* waitForPropertySection();
        yield* focusPropertyTitleAtEnd(titleKhoraId, propertyId);

        yield* When.USER_PRESSES("{ArrowRight}");

        // One linked block created and focused
        yield* Effect.promise(() =>
          waitFor(
            async () => {
              const tuplesAfter = await Property.getLinkedTuples(
                propertyId,
                rootNodeId,
              ).pipe(runtime.runPromise);
              expect(tuplesAfter).toHaveLength(1);

              const expectedKhoraId = Id.makePropertyKhoraId(
                frameId,
                rootNodeId,
                propertyId,
                tuplesAfter[0]!.tupleId,
              );
              const mode = await Effect.gen(function* () {
                const Frame = yield* FrameT;
                return yield* Frame.getMode();
              }).pipe(runtime.runPromise);
              expect(mode).toEqual({
                type: "khora",
                khoraId: expectedKhoraId,
              });
            },
            { timeout: 3000 },
          ),
        );
      }).pipe(runtime.runPromise);
    });
  });

  describe("mid-text cursor", () => {
    it("moves cursor normally without triggering creation", async () => {
      await Effect.gen(function* () {
        const Property = yield* PropertyT;

        const { frameId, rootNodeId, viewId, propertyId, titleKhoraId } =
          yield* createUnboundProperty("Priority");

        render(() => <FrameView frameId={frameId} />);
        yield* waitForPropertySection();

        // Focus at offset 3 (mid-text in "Priority")
        yield* Given.KHORA_IS_FOCUSED_AT(titleKhoraId, 3);
        yield* Effect.promise(() =>
          waitFor(
            () => {
              const cm = document.querySelector(
                ".property-name .cm-editor.cm-focused",
              );
              expect(cm).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        yield* When.USER_PRESSES("{ArrowRight}");
        yield* doubleRaf;

        // Property still unbound
        const props = yield* Property.getPropertiesForView(viewId);
        const prop = props.find((p) => p.id === propertyId);
        expect(prop?.isBound).toBe(false);

        // No linked blocks created
        const tuples = yield* Property.getLinkedTuples(propertyId, rootNodeId);
        expect(tuples).toHaveLength(0);
      }).pipe(runtime.runPromise);
    });
  });

  describe("frame block regression", () => {
    it("ArrowRight at end of frame block still moves to next block", async () => {
      await Effect.gen(function* () {
        const { frameId, childNodeIds } =
          yield* Given.A_FRAME_WITH_CHILDREN("Page", [
            { text: "first" },
            { text: "second" },
          ]);

        const block1 = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
        const block2 = Id.makeFrameKhoraId(frameId, childNodeIds[1]);

        render(() => <FrameView frameId={frameId} />);
        yield* Effect.promise(() =>
          waitFor(
            () => {
              expect(
                document.querySelector(`[data-element-id="${block1}"]`),
              ).toBeTruthy();
              expect(
                document.querySelector(`[data-element-id="${block2}"]`),
              ).toBeTruthy();
            },
            { timeout: 2000 },
          ),
        );

        yield* Given.KHORA_IS_FOCUSED_AT(block1, 5); // "first" = 5 chars

        yield* When.USER_PRESSES("{ArrowRight}");

        yield* Then.SELECTION_IS_ON_KHORA(block2);
      }).pipe(runtime.runPromise);
    });
  });
});
