import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { Effect } from "effect";

/**
 * Toggle a node through checkbox states:
 * 1. Normal block → Unchecked checkbox (add CHECKBOX + IS_CHECKED=FALSE)
 * 2. Unchecked checkbox → Checked (IS_CHECKED=TRUE)
 * 3. Checked checkbox → Normal block (remove CHECKBOX + delete tuple)
 *
 * Replaces LIST_ELEMENT if present (decorative types are mutually exclusive).
 */
export const toggleCheckbox = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;

    const hasCheckbox = yield* Type.hasType(nodeId, System.CHECKBOX);

    if (!hasCheckbox) {
      const hasListElement = yield* Type.hasType(nodeId, System.LIST_ELEMENT);
      if (hasListElement) {
        yield* Type.removeType(nodeId, System.LIST_ELEMENT);
      }

      yield* Type.addType(nodeId, System.CHECKBOX);
      yield* Tuple.create(System.IS_CHECKED, [nodeId, System.FALSE]);
      return;
    }

    const tuples = yield* Tuple.findByPosition(System.IS_CHECKED, 0, nodeId);
    const checkedTuple = tuples.find((t) => t.members[1] === System.TRUE);

    if (!checkedTuple) {
      const uncheckedTuple = tuples[0];
      if (uncheckedTuple) {
        yield* Tuple.delete(uncheckedTuple.id);
      }
      yield* Tuple.create(System.IS_CHECKED, [nodeId, System.TRUE]);
    } else {
      yield* Type.removeType(nodeId, System.CHECKBOX);
      yield* Tuple.delete(checkedTuple.id);
    }
  }).pipe(Effect.withSpan("toggleCheckbox"));
