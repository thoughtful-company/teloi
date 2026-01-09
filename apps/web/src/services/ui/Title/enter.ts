import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { YjsT } from "@/services/external/Yjs";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { makeCollapsedSelection } from "@/utils/selectionStrategy";
import { Effect, Option } from "effect";

export interface EnterParams {
  cursorPos: number;
  textAfter: string;
}

export const enter = (
  bufferId: Id.Buffer,
  nodeId: Id.Node,
  params: EnterParams,
) =>
  Effect.gen(function* () {
    const Node = yield* NodeT;
    const Buffer = yield* BufferT;
    const Window = yield* WindowT;
    const Yjs = yield* YjsT;

    const ytext = Yjs.getText(nodeId);

    // Create new node as first child
    const newNodeId = yield* Node.insertNode({
      parentId: nodeId,
      insert: "before",
    });

    // Update Y.Text atomically: title keeps text before cursor, new block gets text after
    const clampedPos = Math.max(0, Math.min(params.cursorPos, ytext.length));
    Yjs.doc.transact(() => {
      ytext.delete(clampedPos, ytext.length - clampedPos);
      const newYtext = Yjs.getText(newNodeId);
      newYtext.insert(0, params.textAfter);
    });

    const newBlockId = Id.makeBlockId(bufferId, newNodeId);
    yield* Buffer.setSelection(bufferId, makeCollapsedSelection(newNodeId, 0));
    yield* Window.setActiveElement(
      Option.some({ type: "block" as const, id: newBlockId }),
    );
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("[Title.enter] Operation failed").pipe(
        Effect.annotateLogs({ bufferId, nodeId, error: String(error) }),
      ),
    ),
  );
