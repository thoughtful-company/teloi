import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { Effect, Option, Stream } from "effect";
import { getPropertyConfig } from "./getPropertyConfig";
import type { LinkedTuple } from "./getLinkedTuples";

/**
 * Subscribe to linked tuples for a property on a given page.
 *
 * Reacts to:
 * - property binding creation/removal via PROPERTY_USES_TUPLE
 * - linked tuple creation/removal for the bound tuple type on the host page
 */
export const subscribeLinkedTuples = (propertyId: Id.Node, pageId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;

    const bindingStream = yield* Tuple.subscribeByPosition(
      System.PROPERTY_USES_TUPLE,
      0,
      propertyId,
    );

    return Stream.flatMap(
      bindingStream,
      (): Stream.Stream<readonly LinkedTuple[]> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const configOpt = yield* getPropertyConfig(propertyId, Tuple);
            if (Option.isNone(configOpt)) {
              const empty: readonly LinkedTuple[] = [];
              return Stream.succeed(empty);
            }

            const { tupleTypeId, hostPosition, displayPosition } =
              configOpt.value;

            const tupleStream = yield* Tuple.subscribeByPosition(
              tupleTypeId,
              hostPosition,
              pageId,
              displayPosition,
            );

            return Stream.map(tupleStream, (tuples) =>
              tuples.map((tuple) => {
                const displayNodeId = tuple.members[displayPosition];
                if (!displayNodeId) {
                  throw new Error(
                    `Tuple ${tuple.id} is missing display member at position ${displayPosition}`,
                  );
                }

                return {
                  tupleId: tuple.id,
                  displayNodeId,
                };
              }),
            );
          }),
        ),
      { switch: true },
    );
  });
