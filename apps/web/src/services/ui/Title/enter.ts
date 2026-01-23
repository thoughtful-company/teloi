import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { AutomergeT } from "@/services/external/Automerge";
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
    const Automerge = yield* AutomergeT;

    const currentText = yield* Automerge.getText(nodeId);

    // Create new node as first child
    const newNodeId = yield* Node.insertNode({
      parentId: nodeId,
      insert: "before",
    });

    // Update text: title keeps text before cursor, new block gets text after
    const clampedPos = Math.max(
      0,
      Math.min(params.cursorPos, currentText.length),
    );
    yield* Automerge.setText(nodeId, currentText.slice(0, clampedPos));
    yield* Automerge.setText(newNodeId, params.textAfter);

    const newBlockId = Id.makeBufferBlockId(bufferId, newNodeId);
    yield* Buffer.setSelection(bufferId, makeCollapsedSelection(newBlockId, 0));
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
