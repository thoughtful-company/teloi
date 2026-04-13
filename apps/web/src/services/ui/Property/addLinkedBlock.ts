import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { nanoid } from "nanoid";
import { getPropertyConfig } from "./getPropertyConfig";

/** Options for addLinkedBlock */
export interface AddLinkedBlockOptions {
  /**
   * Pre-existing nodeId to use instead of creating a new node.
   * When provided, skips node creation (assumes node already exists in Yjs).
   * Used by GhostBlock to materialize phantom nodes.
   */
  nodeId?: Id.Node;
  /**
   * Insert the new linked tuple immediately after this tuple.
   * When omitted, the new tuple is appended to the end.
   */
  afterTupleId?: Id.Tuple;
}

/**
 * Add a linked block to a property for a given page.
 * - Creates a new node (unless nodeId is provided in options)
 * - Creates a tuple instance with the bound tuple type,
 *   placing pageId at hostPosition and newNodeId at displayPosition
 *
 * @returns The node ID and tuple instance ID of the newly created linked block
 */
export const addLinkedBlock = (
  propertyId: Id.Node,
  pageId: Id.Node,
  options?: AddLinkedBlockOptions,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Tuple = yield* TupleT;

    const configOpt = yield* getPropertyConfig(propertyId, Tuple);
    if (Option.isNone(configOpt)) {
      return yield* Effect.die(
        new Error(
          "Cannot add linked block: property is not bound to a tuple type",
        ),
      );
    }

    const { tupleTypeId, hostPosition, displayPosition } = configOpt.value;

    const existingTuples = yield* Tuple.findByPosition(
      tupleTypeId,
      hostPosition,
      pageId,
      displayPosition,
    );

    const displayFractionalIndex = yield* computeDisplayFractionalIndex(
      existingTuples,
      displayPosition,
      options?.afterTupleId,
    );

    const newNodeId = options?.nodeId ?? Id.Node.make(nanoid());

    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: newNodeId },
      }),
    );

    const members =
      hostPosition === 0 ? [pageId, newNodeId] : [newNodeId, pageId];

    const memberFractionalIndices =
      displayPosition === 0
        ? [displayFractionalIndex, ""]
        : ["", displayFractionalIndex];

    const tupleId = yield* Tuple.create(
      tupleTypeId,
      members,
      memberFractionalIndices,
    );

    yield* Effect.logDebug(
      "[Property.addLinkedBlock] Linked block created",
    ).pipe(
      Effect.annotateLogs({
        propertyId,
        pageId,
        nodeId: newNodeId,
        tupleId,
        tupleTypeId,
        displayFractionalIndex,
        insertedAfterTupleId: options?.afterTupleId ?? null,
        fromGhost: options?.nodeId != null,
      }),
    );

    return { nodeId: newNodeId, tupleId };
  });

// ================================ Internal ==================================

const computeDisplayFractionalIndex = Effect.fn(
  "computeDisplayFractionalIndex",
)(function* (
  existingTuples: readonly {
    id: Id.Tuple;
    memberFractionalIndices: readonly string[];
  }[],
  displayPosition: number,
  afterTupleId?: Id.Tuple,
) {
  if (existingTuples.length === 0) {
    return generateKeyBetween(null, null);
  }

  if (afterTupleId == null) {
    const lastIdx =
      existingTuples[existingTuples.length - 1]!.memberFractionalIndices[
        displayPosition
      ] || null;
    return generateKeyBetween(lastIdx, null);
  }

  const siblingIndex = existingTuples.findIndex(
    (tuple) => tuple.id === afterTupleId,
  );
  if (siblingIndex === -1) {
    return yield* Effect.die(
      new Error(
        `Cannot insert linked block: tuple ${afterTupleId} was not found`,
      ),
    );
  }

  const prevIdx =
    existingTuples[siblingIndex]!.memberFractionalIndices[displayPosition] ||
    null;
  const nextIdx =
    siblingIndex + 1 < existingTuples.length
      ? existingTuples[siblingIndex + 1]!.memberFractionalIndices[
          displayPosition
        ] || null
      : null;

  return generateKeyBetween(prevIdx, nextIdx);
});
