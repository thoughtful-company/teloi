import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { Effect } from "effect";
import { nanoid } from "nanoid";
import { addLinkedBlock } from "./addLinkedBlock";
import { bindToTupleType } from "./bindToTupleType";

/**
 * Quick-create a tuple type for an unbound property.
 *
 * This is triggered when user presses ArrowRight at the end of an unbound
 * property name. It:
 * 1. Creates a Tuple Type named "{propertyName}_Tuple" as shadow child of SCHEMA
 * 2. Adds TUPLE_TYPE type to the tuple type node
 * 3. Creates position 0 node (shadow child) with title = property name
 * 4. Creates position 1 node (shadow child) with title = "Is {name} For"
 * 5. Adds roles via Tuple.addRole for both positions
 * 6. Binds property to tuple type (hostPosition=1, displayPosition=0)
 * 7. Creates initial linked block (tuple instance)
 *
 * @param propertyId - The property node to bind
 * @param pageId - The page where the linked block will appear
 * @returns The ID of the newly created linked block
 */
export const quickCreateTupleType = (propertyId: Id.Node, pageId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // 1. Get property name from Y.Text
    const propertyName = Yjs.getText(propertyId).toString() || "Untitled";

    // 2. Create tuple type node as shadow child of SCHEMA
    const tupleTypeId = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: tupleTypeId },
      }),
    );
    // Move to shadow
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

    // 3. Add TUPLE_TYPE type to tuple type node
    yield* Type.addType(tupleTypeId, System.TUPLE_TYPE);

    // 4. Set tuple type title to "{propertyName}_Tuple"
    Yjs.getText(tupleTypeId).insert(0, `${propertyName}_Tuple`);

    // 5. Create position 0 node (shadow child of tuple type), title = property name
    const position0Id = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: position0Id },
      }),
    );
    yield* Store.commit(
      events.nodeMoved({
        timestamp: Date.now(),
        data: {
          nodeId: position0Id,
          newParentId: tupleTypeId,
          position: "a0",
          inShadow: true,
        },
      }),
    );
    Yjs.getText(position0Id).insert(0, propertyName);

    // 6. Create position 1 node (shadow child of tuple type), title = "Is {name} For"
    const position1Id = Id.Node.make(nanoid());
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: { nodeId: position1Id },
      }),
    );
    yield* Store.commit(
      events.nodeMoved({
        timestamp: Date.now(),
        data: {
          nodeId: position1Id,
          newParentId: tupleTypeId,
          position: "a1",
          inShadow: true,
        },
      }),
    );
    Yjs.getText(position1Id).insert(0, `Is ${propertyName} For`);

    // 7. Add roles via Tuple.addRole for both positions
    yield* Tuple.addRole(tupleTypeId, 0, propertyName, true);
    yield* Tuple.addRole(tupleTypeId, 1, `Is ${propertyName} For`, true);

    // 8. Bind property to tuple type (hostPosition=1, displayPosition=0)
    yield* bindToTupleType(propertyId, tupleTypeId, 1, 0);

    // 9. Create initial linked block (tuple instance)
    const linkedBlockId = yield* addLinkedBlock(propertyId, pageId);

    return linkedBlockId;
  });
