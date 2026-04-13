import { events } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { AutomergeT } from "@/services/external/Automerge";
import { StoreT } from "@/services/external/Store";
import { Effect, Option } from "effect";
import { nanoid } from "nanoid";
import { addLinkedBlock } from "./addLinkedBlock";
import { bindToTupleType } from "./bindToTupleType";
import { getPropertyConfig } from "./getPropertyConfig";

/**
 * Quick-create: ensure a property is bound and has a linked block.
 *
 * Triggered when user presses ArrowRight at the end of a property name.
 * Idempotent for binding — if the property is already bound, skips tuple
 * type creation and just creates a new linked block.
 *
 * For unbound properties:
 * 1. Creates a Tuple Type named "{propertyName}_Tuple" as shadow child of SCHEMA
 * 2. Adds TUPLE_TYPE type to the tuple type node
 * 3. Creates position 0 node (shadow child) with title = property name
 * 4. Creates position 1 node (shadow child) with title = "Is {name} For"
 * 5. Adds roles via Tuple.addRole for both positions
 * 6. Binds property to tuple type (hostPosition=1, displayPosition=0)
 * 7. Creates first linked block
 *
 * For already-bound properties:
 * 1. Creates a new linked block
 *
 * @param propertyId - The property node
 * @param pageId - The host page node (needed for tuple instance creation)
 * @returns The tuple type ID, new node ID, and tuple instance ID
 */
export const quickCreateTupleType = (propertyId: Id.Node, pageId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Automerge = yield* AutomergeT;

    const existingConfig = yield* getPropertyConfig(propertyId, Tuple);

    let tupleTypeId: Id.Node;

    if (Option.isSome(existingConfig)) {
      tupleTypeId = existingConfig.value.tupleTypeId;
    } else {
      const propertyName =
        (yield* Automerge.getText(propertyId)) || "Untitled";

      tupleTypeId = Id.Node.make(nanoid());
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
    }

    const { nodeId, tupleId } = yield* addLinkedBlock(propertyId, pageId);

    return { tupleTypeId, nodeId, tupleId };
  });
