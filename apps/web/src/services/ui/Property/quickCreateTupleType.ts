import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { Effect } from "effect";
import { nanoid } from "nanoid";
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
 *
 * After binding, the property will show a ghost block. The first linked block
 * is created when the user types in the ghost block (ghost materialization).
 *
 * @param propertyId - The property node to bind
 * @returns The tuple type ID
 */
export const quickCreateTupleType = (propertyId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Automerge = yield* AutomergeT;

    const propertyName = (yield* Automerge.getText(propertyId)) || "Untitled";

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

    yield* Type.addType(tupleTypeId, System.TUPLE_TYPE);

    yield* Automerge.setText(tupleTypeId, `${propertyName}_Tuple`);

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
    yield* Automerge.setText(position0Id, propertyName);

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
    yield* Automerge.setText(position1Id, `Is ${propertyName} For`);

    yield* Tuple.addRole(tupleTypeId, 0, propertyName, true);
    yield* Tuple.addRole(tupleTypeId, 1, `Is ${propertyName} For`, true);

    yield* bindToTupleType(propertyId, tupleTypeId, 1, 0);

    return tupleTypeId;
  });
