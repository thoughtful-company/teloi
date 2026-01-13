import { Id, Model } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";
import { expandAncestors } from "./expandAncestors";

export const setSelection = (
  bufferId: Id.Buffer,
  selection: Option.Option<Model.BufferSelection>,
): Effect.Effect<void, BufferNotFoundError, StoreT | NodeT> =>
  Effect.gen(function* () {
    const Store = yield* StoreT;

    const bufferDoc = yield* Store.getDocument("buffer", bufferId).pipe(
      Effect.orDie,
    );

    if (Option.isNone(bufferDoc)) {
      return yield* Effect.fail(new BufferNotFoundError({ bufferId }));
    }

    const currentBuffer = bufferDoc.value;
    const assignedNodeId = currentBuffer.assignedNodeId;

    if (Option.isSome(selection) && assignedNodeId) {
      const rootNodeId = Id.Node.make(assignedNodeId);
      const { anchor, focus } = selection.value;

      yield* expandAncestors(bufferId, rootNodeId, anchor.nodeId);

      if (focus.nodeId !== anchor.nodeId) {
        yield* expandAncestors(bufferId, rootNodeId, focus.nodeId);
      }
    }

    yield* Store.setDocument(
      "buffer",
      {
        ...currentBuffer,
        selection: Option.getOrNull(selection),
      },
      bufferId,
    ).pipe(Effect.orDie);

    yield* Effect.logDebug("[Buffer.setSelection] Selection updated").pipe(
      Effect.annotateLogs({
        bufferId,
        selection: Option.match(selection, {
          onNone: () => null,
          onSome: (s) =>
            `${s.anchor.nodeId}:${s.anchorOffset}-${s.focus.nodeId}:${s.focusOffset}|accos:${s.assoc}`,
        }),
      }),
    );
  });
