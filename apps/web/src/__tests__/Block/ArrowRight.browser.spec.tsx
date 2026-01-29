import "@/index.css";
import { Id } from "@/schema";
import { BlockT } from "@/services/ui/Block";
import { StoreT } from "@/services/external/Store";
import BufferView from "@/ui/BufferView";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Block ArrowRight key", () => {
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

  it("moves to next sibling at start when ArrowRight pressed at end", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <BufferView bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(secondChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("moves to first child when block has children", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Parent" }],
      );

      const childId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Child",
      });

      const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBufferBlockId(bufferId, childId);

      render(() => <BufferView bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(childBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent's next sibling when last child", async () => {
    await Effect.gen(function* () {
      // Root -> [First, Second]
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      // First -> [Nested]
      const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedId);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

      render(() => <BufferView bufferId={bufferId} />);

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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <BufferView bufferId={bufferId} />);

      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      yield* Then.SELECTION_IS_ON_BLOCK(firstBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("skips hidden children when current block is collapsed", async () => {
    await Effect.gen(function* () {
      // Structure:
      // Root
      // ├── First (cursor at end, collapsed with child)
      // │   └── Nested (hidden because First is collapsed)
      // └── Second
      //
      // ArrowRight from end of First should go to Second, not Nested

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      const Block = yield* BlockT;
      yield* Block.setExpanded(firstBlockId, false);

      render(() => <BufferView bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{ArrowRight}");

      const Store = yield* StoreT;
      const bufferDoc = yield* Store.getDocument("buffer", bufferId);
      const buffer = Option.getOrThrow(bufferDoc);

      expect(buffer.selection).not.toBeNull();
      const expectedBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);
      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

      expect(buffer.selection!.focus.elementId).not.toBe(nestedBlockId);
      expect(buffer.selection!.focus.elementId).toBe(expectedBlockId);
      expect(buffer.selection!.focusOffset).toBe(0);
    }).pipe(runtime.runPromise);
  });

  it("skips hidden children on ArrowDown when collapsed", async () => {
    await Effect.gen(function* () {
      // Structure:
      // Root
      // ├── First (cursor on last line, collapsed with child)
      // │   └── Nested (hidden)
      // └── Second
      //
      // ArrowDown from First should go to Second, not Nested

      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const nestedChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      const Block = yield* BlockT;
      yield* Block.setExpanded(firstBlockId, false);

      render(() => <BufferView bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{ArrowDown}");

      const Store = yield* StoreT;
      const bufferDoc = yield* Store.getDocument("buffer", bufferId);
      const buffer = Option.getOrThrow(bufferDoc);

      expect(buffer.selection).not.toBeNull();
      const expectedBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);
      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

      expect(buffer.selection!.focus.elementId).not.toBe(nestedBlockId);
      expect(buffer.selection!.focus.elementId).toBe(expectedBlockId);
    }).pipe(runtime.runPromise);
  });
});
