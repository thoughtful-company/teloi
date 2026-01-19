import { Id, Model } from "@/schema";
import * as IdT from "@/schema/id/id";
import { NodeT } from "@/services/domain/Node";
import { Effect, Option } from "effect";
import { StoreT } from "../../external/Store";
import { BufferNotFoundError } from "../errors";
import { expandAncestors } from "./expandAncestors";

/**
 * Get the nodeId from a BlockContext for expansion purposes.
 * Section blocks (linked blocks in property sections) are flat and don't need
 * ancestor expansion, so we return null for them.
 */
const getNodeIdForExpansion = (ctx: Id.BlockContext): Id.Node | null => {
  if (ctx.type === "buffer") {
    return ctx.nodeId;
  }
  // Section blocks don't have tree hierarchy - skip ancestor expansion
  return null;
};

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

      const anchorContext = yield* IdT.parseBlockContext(anchor.elementId).pipe(
        Effect.orDie,
      );
      const anchorNodeId = getNodeIdForExpansion(anchorContext);
      if (anchorNodeId) {
        yield* expandAncestors(bufferId, rootNodeId, anchorNodeId);
      }

      const focusContext = yield* IdT.parseBlockContext(focus.elementId).pipe(
        Effect.orDie,
      );
      const focusNodeId = getNodeIdForExpansion(focusContext);
      if (focusNodeId && focusNodeId !== anchorNodeId) {
        yield* expandAncestors(bufferId, rootNodeId, focusNodeId);
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
            `${s.anchor.elementId}:${s.anchorOffset}-${s.focus.elementId}:${s.focusOffset}|assoc:${s.assoc}`,
        }),
      }),
    );
  });
