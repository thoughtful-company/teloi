import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { describe, it } from "vitest";
import { Given, render, runtime, Then, When } from "../bdd";

describe("Block ArrowRight key", () => {
  it("moves to next sibling at start when ArrowRight pressed at end", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("moves to first child when block has children", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Parent" }],
      );

      const childId = yield* Node.insertNode({
        parentId: childNodeIds[0],
        insert: "after",
        textContent: "Child",
      });

      const parentBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBlockId(bufferId, childId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent's next sibling when last child", async () => {
    await Effect.gen(function* () {
      const Node = yield* NodeT;

      // Root -> [First, Second]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      // First -> [Nested]
      const nestedId = yield* Node.insertNode({
        parentId: childNodeIds[0],
        insert: "after",
        textContent: "Nested",
      });

      const nestedBlockId = Id.makeBlockId(bufferId, nestedId);
      const secondBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // At end of Nested (last child of First), ArrowRight should go to Second
      yield* When.USER_CLICKS_BLOCK(nestedBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("moves from title to first block", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Document Title",
        [{ text: "First block" }],
      );

      const firstBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });
});
