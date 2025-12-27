import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block Delete key", () => {
  /**
   * - First|   <- cursor at end
   * - Second
   *
   * After Delete, should merge with next sibling:
   * - First|Second   <- cursor after "First"
   */
  it("merges with next sibling when Delete pressed at end", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First" },
          { text: "Second" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first child, cursor at end, press Delete
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5); // "First" has 5 characters
      yield* When.USER_PRESSES("{Delete}");

      // Should now have only one child
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // First child should have merged text (in model)
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");

      // Merged text should be visible in the UI
      yield* Then.TEXT_IS_VISIBLE("FirstSecond");

      // Cursor should stay at merge point (after "First")
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });
});
