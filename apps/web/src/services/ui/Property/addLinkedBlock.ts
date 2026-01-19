import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";

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

    // Get binding info from PROPERTY_USES_TUPLE
    const usesTupleTuples = yield* Tuple.findByPosition(
      System.PROPERTY_USES_TUPLE,
      0,
      propertyId,
    );

    if (usesTupleTuples.length === 0) {
      return yield* Effect.die(
        new Error("Cannot add linked block: property is not bound to a tuple type"),
      );
    }

    const tupleTypeId = usesTupleTuples[0]!.members[1] as Id.Node;

    // Get position config from PROPERTY_CONFIG
    const configTuples = yield* Tuple.findByPosition(
      System.PROPERTY_CONFIG,
      0,
      propertyId,
    );

    let hostPosition: 0 | 1 = 0;
    let displayPosition: 0 | 1 = 1;

    if (configTuples.length > 0) {
      const config = configTuples[0]!;
      hostPosition = config.members[1] === System.POSITION_0 ? 0 : 1;
      displayPosition = config.members[2] === System.POSITION_0 ? 0 : 1;
    }

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
