import { events } from "@/livestore/schema";
import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
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
}

/**
 * Add a linked block to a property for a given page.
 * - Creates a new node (unless nodeId is provided in options)
 * - Creates a tuple instance with the bound tuple type,
 *   placing pageId at hostPosition and newNodeId at displayPosition
 *
 * @returns The ID of the newly created node
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
        new Error("Cannot add linked block: property is not bound to a tuple type"),
      );
    }

    const { tupleTypeId, hostPosition, displayPosition } = configOpt.value;

    // Use provided nodeId or generate new one
    // When nodeId is provided, we're materializing a ghost block (Y.Text already exists)
    const newNodeId = options?.nodeId ?? Id.Node.make(nanoid());

    // Create node in LiveStore (always needed, even for ghost materialization)
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: newNodeId },
      }),
    );

    // Create tuple instance with correct positions
    const members: Id.Node[] = [null as unknown as Id.Node, null as unknown as Id.Node];
    members[hostPosition] = pageId;
    members[displayPosition] = newNodeId;

    const tupleId = yield* Tuple.create(tupleTypeId, members);

    yield* Effect.logDebug("[Property.addLinkedBlock] Linked block created").pipe(
      Effect.annotateLogs({
        propertyId,
        pageId,
        nodeId: newNodeId,
        tupleId,
        tupleTypeId,
        fromGhost: options?.nodeId != null,
      }),
    );

    return newNodeId;
  });
