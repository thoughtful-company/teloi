import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block Backspace key", () => {
  it("merges with previous sibling when Backspace pressed at start", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First" },
          { text: "Second" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, cursor at start, press Backspace
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Backspace}");

      // Should now have only one child
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // First child should have merged text
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");

      // Cursor should be at merge point (after "First")
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("places cursor at merge point after clicking different positions before merge", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "123" },
          { text: "12" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Click first block, move cursor to position 2 ("12|3")
      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(2);

      // Click second block at start ("|12")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);

      // Press Backspace to merge
      yield* When.USER_PRESSES("{Backspace}");

      // Should have merged
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "12312");

      // Cursor should be at merge point (after "123" = position 3)
      // NOT at the old position 2 from when we clicked first block
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(3);
    }).pipe(runtime.runPromise);
  });
});
