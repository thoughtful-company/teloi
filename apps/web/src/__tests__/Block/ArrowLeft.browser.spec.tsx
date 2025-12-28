import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block ArrowLeft key", () => {
  it("moves to previous sibling at end when ArrowLeft pressed at position 0", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at start
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);

      // Press ArrowLeft
      yield* When.USER_PRESSES("{ArrowLeft}");

      // Should now be in the first block
      yield* Then.SELECTION_IS_ON_BLOCK(firstChildBlockId);

      // Cursor should be at end of "First" (position 5)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("moves to deepest visible child of previous sibling when it has children", async () => {
    await Effect.gen(function* () {
      // Create: Root -> [First, Second]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      // Add child to First: First -> [Nested]
      const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const nestedChildBlockId = Id.makeBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus second child at start
      yield* When.USER_CLICKS_BLOCK(secondChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);

      // Press ArrowLeft
      yield* When.USER_PRESSES("{ArrowLeft}");

      // Should now be in the nested child (deepest of previous sibling)
      yield* Then.SELECTION_IS_ON_BLOCK(nestedChildBlockId);

      // Cursor should be at end of "Nested" (position 6)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent when at first sibling", async () => {
    await Effect.gen(function* () {
      // Create: Root -> [Parent]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Parent" }],
      );

      // Add child to Parent: Parent -> [Child]
      const childId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Child",
      });

      const parentBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus the child (first sibling of Parent's children)
      yield* When.USER_CLICKS_BLOCK(childBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);

      // Press ArrowLeft
      yield* When.USER_PRESSES("{ArrowLeft}");

      // Should now be in the parent block
      yield* Then.SELECTION_IS_ON_BLOCK(parentBlockId);

      // Cursor should be at end of "Parent" (position 6)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
    }).pipe(runtime.runPromise);
  });

  it("moves to title when at first block in document", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Focus first block at start
      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);

      // Press ArrowLeft
      yield* When.USER_PRESSES("{ArrowLeft}");

      // Should now be in the title
      yield* Then.SELECTION_IS_ON_TITLE(bufferId);

      // Cursor should be at end of "Document Title" (position 14)
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(14);
    }).pipe(runtime.runPromise);
  });
});
