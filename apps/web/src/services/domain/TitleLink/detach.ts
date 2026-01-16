import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { Effect } from "effect";

/**
 * Detach a node from its title link source.
 * Copies the source's text content to the node's own Y.Text,
 * then deletes the RENDERED_NAME tuple to break the link.
 */
export const detach = (nodeId: Id.Node, sourceId: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    const sourceText = Yjs.getText(sourceId).toString();
    const nodeYtext = Yjs.getText(nodeId);
    nodeYtext.insert(0, sourceText);

    const tuples = yield* Tuple.findByPosition(
      System.RENDERED_NAME,
      0,
      nodeId,
    );
    if (tuples.length > 0) {
      yield* Tuple.delete(tuples[0]!.id);
    }

    yield* Effect.logDebug("[TitleLink.detach] Title link detached").pipe(
      Effect.annotateLogs({ nodeId, sourceId }),
    );
  });
