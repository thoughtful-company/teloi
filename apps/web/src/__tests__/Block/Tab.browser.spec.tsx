import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block Tab key", () => {
  it("indents block to become child of previous sibling when Tab pressed", async () => {
    await Effect.gen(function* () {
      // Setup: root with two children
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child and press Tab
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_PRESSES("{Tab}");

      // Root should now have only one child (the first one)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // First child should now have one child (the second one, which was indented)
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Verify the indented node is now child of first sibling
      const Node = yield* NodeT;
      const firstChildChildren = yield* Node.getNodeChildren(childNodeIds[0]);
      yield* Then.NODE_HAS_TEXT(firstChildChildren[0]!, "Second child");
    }).pipe(runtime.runPromise);
  });

  it("indents block when text is selected", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, select some text, then press Tab
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_PRESSES("{Shift>}{End}{/Shift}"); // Select all text
      yield* When.USER_PRESSES("{Tab}");

      // Should still indent despite having selection
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Text should be preserved (not replaced by tab character)
      yield* Then.NODE_HAS_TEXT(childNodeIds[1], "Second child");
    }).pipe(runtime.runPromise);
  });

  it("preserves cursor position after indentation", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child, move cursor to position 7 ("Second |child")
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(7);
      yield* When.USER_PRESSES("{Tab}");

      // Should indent
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Cursor should still be at position 7
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(7);
    }).pipe(runtime.runPromise);
  });
});
