import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";

/**
 * Create a new property under SCHEMA, linked to the given view.
 * - Creates node as child of System.SCHEMA
 * - Sets type to System.PROPERTY
 * - Creates HAS_PROPERTY tuple linking view to property
 */
export const createProperty = (viewId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;

    const propertyId = Id.Node.make(nanoid());

    // 1. Create node as child of SCHEMA
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: propertyId, parentId: System.SCHEMA, position: "a0" },
      }),
    );

    // 2. Set type to PROPERTY
    yield* Type.addType(propertyId, System.PROPERTY);

    // 3. Create HAS_PROPERTY tuple linking view to property
    yield* Tuple.create(System.HAS_PROPERTY, [viewId, propertyId]);

    return propertyId;
  });
