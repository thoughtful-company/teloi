import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";

/**
 * Add a linked block to a property for a given page.
 * - Creates a new node
 * - Creates a tuple instance with the bound tuple type,
 *   placing pageId at hostPosition and newNodeId at displayPosition
 *
 * @returns The ID of the newly created node
 */
export const addLinkedBlock = (propertyId: Id.Node, pageId: Id.Node) =>
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

    // Create new node
    const newNodeId = Id.Node.make(nanoid());
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

    yield* Tuple.create(tupleTypeId, members);

    return newNodeId;
  });
