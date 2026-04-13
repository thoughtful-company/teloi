import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { PropertyLive, PropertyT } from "@/services/ui/Property";
import { ViewT } from "@/services/ui/View";
import { buildViewTestLayer, setupUnitTestWith } from "@/test-utils/unit/setup";
import { Effect, Fiber, Layer, ManagedRuntime, Schedule, Stream } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import { beforeEach, describe, expect, it } from "vitest";

const pollSchedule = Schedule.spaced("10 millis").pipe(
  Schedule.upTo("2 seconds"),
);

const pollUntil = (condition: () => void) =>
  Effect.try({ try: condition, catch: (e) => e as Error }).pipe(
    Effect.retry(pollSchedule),
  );

const buildPropertyTestLayer = (
  liveStore: Parameters<typeof buildViewTestLayer>[0],
  storeId: string,
) =>
  PropertyLive.pipe(Layer.provideMerge(buildViewTestLayer(liveStore, storeId)));

type TestRuntime = ManagedRuntime.ManagedRuntime<
  Layer.Layer.Success<ReturnType<typeof buildPropertyTestLayer>>,
  never
>;

describe("Property ordering", () => {
  let runtime: TestRuntime;
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupUnitTestWith(
      buildPropertyTestLayer,
      "property-ordering",
    );
    runtime = setup.runtime;
    cleanup = setup.cleanup;
  });

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

  const createTupleType = (name: string) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Automerge = yield* AutomergeT;
      const tupleTypeId = Id.Node.make(nanoid());

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId: tupleTypeId, parentId: System.SCHEMA, position: "" },
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
      yield* Automerge.setText(tupleTypeId, name);

      return tupleTypeId;
    });

  const createDisplayNode = (title: string) =>
    Effect.gen(function* () {
      const Store = yield* StoreT;
      const Automerge = yield* AutomergeT;
      const nodeId = Id.Node.make(nanoid());

      yield* Store.commit(
        events.nodeCreated({
          timestamp: Date.now(),
          data: { nodeId },
        }),
      );
      yield* Automerge.setText(nodeId, title);

      return nodeId;
    });

  const createBoundProperty = () =>
    Effect.gen(function* () {
      const Property = yield* PropertyT;
      const View = yield* ViewT;

      const pageId = yield* createPage();
      const viewId = yield* View.getOrCreateView(pageId);
      const tupleTypeId = yield* createTupleType("Tasks_Tuple");
      const propertyId = yield* Property.createProperty(viewId);

      yield* Property.bindToTupleType(propertyId, tupleTypeId, 1, 0);

      return { pageId, propertyId, tupleTypeId };
    });

  const createLinkedTuple = (
    tupleTypeId: Id.Node,
    pageId: Id.Node,
    displayNodeId: Id.Node,
    displayFractionalIndex: string,
  ) =>
    Effect.gen(function* () {
      const Tuple = yield* TupleT;
      return yield* Tuple.create(
        tupleTypeId,
        [displayNodeId, pageId],
        [displayFractionalIndex, ""],
      );
    });

  it("getLinkedTuples returns tuples sorted by display-position fractional index", async () => {
    await Effect.gen(function* () {
      const Property = yield* PropertyT;

      const { pageId, propertyId, tupleTypeId } = yield* createBoundProperty();
      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      const firstNodeId = yield* createDisplayNode("First");
      const secondNodeId = yield* createDisplayNode("Second");

      const secondTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        secondNodeId,
        idx2,
      );
      const firstTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        firstNodeId,
        idx1,
      );

      const linkedTuples = yield* Property.getLinkedTuples(propertyId, pageId);

      expect(linkedTuples.map((tuple) => tuple.tupleId)).toEqual([
        firstTupleId,
        secondTupleId,
      ]);
      expect(linkedTuples.map((tuple) => tuple.displayNodeId)).toEqual([
        firstNodeId,
        secondNodeId,
      ]);
    }).pipe(runtime.runPromise);
  });

  it("subscribeLinkedTuples emits tuples sorted by display-position fractional index", async () => {
    await Effect.gen(function* () {
      const Property = yield* PropertyT;

      const { pageId, propertyId, tupleTypeId } = yield* createBoundProperty();
      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);
      const idxBetween = generateKeyBetween(idx1, idx2);

      const firstNodeId = yield* createDisplayNode("First");
      const secondNodeId = yield* createDisplayNode("Second");
      const middleNodeId = yield* createDisplayNode("Middle");

      const secondTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        secondNodeId,
        idx2,
      );
      const firstTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        firstNodeId,
        idx1,
      );

      const stream = yield* Property.subscribeLinkedTuples(propertyId, pageId);
      const collected: Array<
        readonly { tupleId: Id.Tuple; displayNodeId: Id.Node }[]
      > = [];

      const fiber = yield* Stream.runForEach(stream, (tuples) =>
        Effect.sync(() => {
          collected.push([...tuples]);
        }),
      ).pipe(Effect.fork);

      yield* pollUntil(() => {
        const last = collected[collected.length - 1]!;
        expect(last.map((tuple) => tuple.tupleId)).toEqual([
          firstTupleId,
          secondTupleId,
        ]);
      });

      const middleTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        middleNodeId,
        idxBetween,
      );

      yield* pollUntil(() => {
        const last = collected[collected.length - 1]!;
        expect(last.map((tuple) => tuple.tupleId)).toEqual([
          firstTupleId,
          middleTupleId,
          secondTupleId,
        ]);
      });

      yield* Fiber.interrupt(fiber);
    }).pipe(runtime.runPromise);
  });

  it("addLinkedBlock inserts a new linked tuple after the specified tuple and before the next tuple", async () => {
    await Effect.gen(function* () {
      const Property = yield* PropertyT;
      const Tuple = yield* TupleT;

      const { pageId, propertyId, tupleTypeId } = yield* createBoundProperty();
      const idx1 = generateKeyBetween(null, null);
      const idx2 = generateKeyBetween(idx1, null);

      const firstNodeId = yield* createDisplayNode("First");
      const secondNodeId = yield* createDisplayNode("Second");

      const firstTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        firstNodeId,
        idx1,
      );
      const secondTupleId = yield* createLinkedTuple(
        tupleTypeId,
        pageId,
        secondNodeId,
        idx2,
      );

      const created = yield* Property.addLinkedBlock(propertyId, pageId, {
        afterTupleId: firstTupleId,
      });

      const linkedTuples = yield* Property.getLinkedTuples(propertyId, pageId);
      expect(linkedTuples.map((tuple) => tuple.tupleId)).toEqual([
        firstTupleId,
        created.tupleId,
        secondTupleId,
      ]);

      const createdTuple = yield* Tuple.get(created.tupleId);
      expect(createdTuple._tag).toBe("Some");
      if (createdTuple._tag === "Some") {
        const createdIndex = createdTuple.value.memberFractionalIndices[0]!;
        expect(createdIndex > idx1).toBe(true);
        expect(createdIndex < idx2).toBe(true);
      }
    }).pipe(runtime.runPromise);
  });
});
