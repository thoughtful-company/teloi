import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block Undo (Cmd+Z)", () => {
  /**
   * - [Hello]   <- select all, press Backspace
   *
   * After Backspace: empty block
   * After Undo: should restore "Hello"
   *
   * KNOWN BUG: Undo doesn't restore deleted text.
   * See CLAUDE.md "Known Bug: Undo breaks due to model→editor data flow"
   */
  it.fails("restores deleted text after select-all and Backspace", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Hello" }],
      );

      const [nodeId] = childNodeIds;
      const blockId = Id.makeBlockId(bufferId, nodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus block
      yield* When.USER_CLICKS_BLOCK(blockId);

      // Select all (Cmd+A) and delete
      yield* When.USER_PRESSES("{Meta>}a{/Meta}");
      yield* When.USER_PRESSES("{Backspace}");

      // Verify text was deleted
      yield* Then.NODE_HAS_TEXT(nodeId, "");

      // Undo
      yield* When.USER_PRESSES("{Meta>}z{/Meta}");

      // Should restore original text
      yield* Then.NODE_HAS_TEXT(nodeId, "Hello");
    }).pipe(runtime.runPromise);
  });

  /**
   * - First|   <- cursor at end
   * - Second
   *
   * After Delete (merges Second into First), then Cmd+Z:
   * - First
   * - Second   <- should restore the merged block
   *
   * This tests undo after model->editor sync (merge updates model,
   * which then syncs merged text back to CodeMirror).
   *
   * KNOWN BUG: CodeMirror's undo can't reverse model-level operations.
   * See CLAUDE.md "Known Bug: Undo breaks due to model→editor data flow"
   */
  it.fails("undoes block merge after Delete", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root", [
          { text: "First" },
          { text: "Second" },
        ]);

      const [firstNodeId] = childNodeIds;
      const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first block at end
      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5); // "First" = 5 chars

      // Delete to merge Second into First
      yield* When.USER_PRESSES("{Delete}");

      // Verify merge happened
      yield* Then.NODE_HAS_TEXT(firstNodeId, "FirstSecond");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Undo the merge
      yield* When.USER_PRESSES("{Meta>}z{/Meta}");

      // Should restore both blocks
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
      yield* Then.NODE_HAS_TEXT(firstNodeId, "First");
    }).pipe(runtime.runPromise);
  });
});
