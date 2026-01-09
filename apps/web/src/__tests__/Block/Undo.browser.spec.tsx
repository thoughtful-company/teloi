import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Undo (Cmd+Z)", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * - [Hello]   <- select all, press Backspace
   *
   * After Backspace: empty block
   * After Undo: should restore "Hello"
   */
  it("restores deleted text after select-all and Backspace", async () => {
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
   * KNOWN LIMITATION: Yjs handles per-node text undo, but can't restore
   * deleted nodes. Block-level undo requires a separate undo stack.
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
