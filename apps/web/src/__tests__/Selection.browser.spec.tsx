import "@/index.css";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect, Option } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "./bdd";

describe("Selection sync", () => {
  it("syncs selection from model to CodeMirror", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hello world" }],
      );

      const blockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the block to mount CodeMirror
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Set selection via model (position 5 = "Hello| world")
      const Buffer = yield* BufferT;
      yield* Buffer.setSelection(
        bufferId,
        Option.some({
          anchorBlockId: blockId,
          anchorOffset: 5,
          focusBlockId: blockId,
          focusOffset: 5,
        }),
      );

      // Give time for the effect to sync
      yield* Effect.sleep("50 millis");

      // Verify CodeMirror cursor is at position 5
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("preserves selection when block remounts after structural change", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, move cursor to position 7
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(7);

      // Indent (causes remount under new parent)
      yield* When.USER_PRESSES("{Tab}");

      // Verify structure changed
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Cursor should still be at position 7 after remount
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(7);
    }).pipe(runtime.runPromise);
  });
});
