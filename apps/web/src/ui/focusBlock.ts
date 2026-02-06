import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { WindowT } from "@/services/ui/Window";
import { waitFrames } from "@/utils/effect";
import { Effect, Option } from "effect";

/**
 * Focus a block element from a mousedown handler.
 *
 * Defers activeElement by one rAF so LiveStore processes the
 * selection update before CodeMirror mounts with view.focus().
 */
export const focusBlock = Effect.fn("focusBlock")(function* (params: {
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  blockId: Id.Block;
  offset?: number | undefined;
  assoc?: 0 | 1 | -1 | undefined;
}) {
  const { bufferId, nodeId, blockId, offset, assoc } = params;
  const Buffer = yield* BufferT;
  const Window = yield* WindowT;

  yield* Buffer.setBlockSelection(bufferId, [], nodeId);
  yield* Buffer.setSelection(
    bufferId,
    Option.some({
      anchor: { elementId: blockId },
      anchorOffset: offset ?? 0,
      focus: { elementId: blockId },
      focusOffset: offset ?? 0,
      goalX: null,
      goalLine: null,
      assoc: assoc ?? 0,
    }),
  );
  yield* Effect.forkDaemon(
    waitFrames(1).pipe(
      Effect.andThen(
        Window.setActiveElement(
          Option.some({ type: "block" as const, id: blockId }),
        ),
      ),
    ),
  );
});
