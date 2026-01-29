/**
 * Unit tests for editor:left command.
 * Tests navigation logic without CodeMirror/browser dependencies.
 */

import { handle, Left } from "@/commands/editor/left";
import { Id } from "@/schema";
import { BufferT } from "@/services/ui/Buffer";
import { Effect, Option } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Given from "@/test-utils/unit/given";
import {
  setupCommandTest,
  type CommandRuntime,
  type EditorTestHandle,
} from "@/test-utils/unit/setup";

describe("editor:left command", () => {
  let runtime: CommandRuntime;
  let editor: EditorTestHandle;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupCommandTest();
    runtime = setup.runtime;
    editor = setup.editor;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * Helper to assert selection is on a specific block at a specific offset.
   */
  const assertSelectionOnBlock = (
    expectedBlockId: Id.Block,
    expectedOffset: number,
  ) =>
    Effect.gen(function* () {
      const [bufferId] = yield* Id.parseBlockId(expectedBlockId);
      const Buffer = yield* BufferT;
      const selection = yield* Buffer.getSelection(bufferId);

      expect(
        Option.isSome(selection),
        "Selection should exist after navigation",
      ).toBe(true);

      if (Option.isSome(selection)) {
        expect(
          selection.value.focus.elementId,
          `Selection should be on block ${expectedBlockId}`,
        ).toBe(expectedBlockId);
        expect(
          selection.value.focusOffset,
          `Cursor should be at offset ${expectedOffset}`,
        ).toBe(expectedOffset);
      }
    });

  /**
   * Helper to assert selection is on the title (buffer root).
   */
  const assertSelectionOnTitle = (bufferId: Id.Buffer, rootNodeId: Id.Node) =>
    Effect.gen(function* () {
      const Buffer = yield* BufferT;
      const selection = yield* Buffer.getSelection(bufferId);
      const titleBlockId = Id.makeBufferBlockId(bufferId, rootNodeId);

      expect(
        Option.isSome(selection),
        "Selection should exist after navigation",
      ).toBe(true);

      if (Option.isSome(selection)) {
        expect(
          selection.value.focus.elementId,
          `Selection should be on title block`,
        ).toBe(titleBlockId);
      }
    });

  it("moves to previous sibling at end when at position 0", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with two children
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const firstChildBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      // Given: Active element is second child
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: secondChildBlockId });

      // Given: Cursor is at start (position 0)
      yield* editor.setCursorAtStart(true);

      // When: User presses Left (handled by editor:left command)
      yield* handle(new Left());

      // Then: Selection should be on first block at end (position 5 = "First".length)
      yield* assertSelectionOnBlock(firstChildBlockId, 5);
    }).pipe(runtime.runPromise);
  });

  it("moves to deepest visible child of previous sibling when it has children", async () => {
    await Effect.gen(function* () {
      // Given: Root -> [First, Second] where First has child [Nested]
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

      const nestedChildBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);
      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      // Given: Active element is second child
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: secondChildBlockId });

      // Given: Cursor is at start
      yield* editor.setCursorAtStart(true);

      // When: User presses Left
      yield* handle(new Left());

      // Then: Selection should be on nested child at end (position 6 = "Nested".length)
      yield* assertSelectionOnBlock(nestedChildBlockId, 6);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent when at first sibling", async () => {
    await Effect.gen(function* () {
      // Given: Root -> [Parent] where Parent has child [Child]
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

      const parentBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const childBlockId = Id.makeBufferBlockId(bufferId, childId);

      // Given: Active element is the child (first sibling of Parent's children)
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: childBlockId });

      // Given: Cursor is at start
      yield* editor.setCursorAtStart(true);

      // When: User presses Left
      yield* handle(new Left());

      // Then: Selection should be on parent at end (position 6 = "Parent".length)
      yield* assertSelectionOnBlock(parentBlockId, 6);
    }).pipe(runtime.runPromise);
  });

  it("moves to title when at first block in document", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with one child
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
        ]);

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      // Given: Active element is first block
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: firstBlockId });

      // Given: Cursor is at start
      yield* editor.setCursorAtStart(true);

      // When: User presses Left
      yield* handle(new Left());

      // Then: Selection should be on title at end (position 14 = "Document Title".length)
      yield* assertSelectionOnTitle(bufferId, rootNodeId);

      // Also verify the cursor offset
      const Buffer = yield* BufferT;
      const selection = yield* Buffer.getSelection(bufferId);
      expect(Option.isSome(selection)).toBe(true);
      if (Option.isSome(selection)) {
        expect(selection.value.focusOffset).toBe(14);
      }
    }).pipe(runtime.runPromise);
  });

  it("skips hidden children when previous sibling is collapsed", async () => {
    await Effect.gen(function* () {
      // Given: Root -> [First (collapsed), Second]
      // First has child [Nested] but it's hidden because First is collapsed
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

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);
      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

      // Given: First block is collapsed (hide its children)
      yield* Given.BLOCK_IS_COLLAPSED(firstBlockId);

      // Given: Active element is second block
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: secondBlockId });

      // Given: Cursor is at start
      yield* editor.setCursorAtStart(true);

      // When: User presses Left
      yield* handle(new Left());

      // Then: Selection should be on First (NOT Nested, which is hidden)
      const Buffer = yield* BufferT;
      const selection = yield* Buffer.getSelection(bufferId);

      expect(Option.isSome(selection)).toBe(true);
      if (Option.isSome(selection)) {
        expect(
          selection.value.focus.elementId,
          "Selection should NOT be on hidden Nested child",
        ).not.toBe(nestedBlockId);

        expect(
          selection.value.focus.elementId,
          "Selection should be on visible First block",
        ).toBe(firstBlockId);

        expect(
          selection.value.focusOffset,
          "Cursor should be at end of 'First'",
        ).toBe(5);
      }
    }).pipe(runtime.runPromise);
  });

  it("calls moveLeft when cursor is not at start (no navigation)", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a child
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hello" }],
      );

      const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      // Given: Active element is the block
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: blockId });

      // Given: Cursor is NOT at start (somewhere in the middle)
      yield* editor.setCursorAtStart(false);
      yield* editor.resetMoveLeftCalled();

      // When: User presses Left
      yield* handle(new Left());

      // Then: moveLeft should have been called (no navigation)
      const moveLeftWasCalled = yield* editor.getMoveLeftCalled();
      expect(moveLeftWasCalled, "moveLeft() should be called").toBe(true);

      // And: Selection should not have changed (no navigation occurred)
      // The selection might not even be set in this test since we're testing
      // the early return path where moveLeft handles things internally
    }).pipe(runtime.runPromise);
  });
});
