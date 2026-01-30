import { handle as handleLeft, Left } from "@/commands/editor/left";
import { handle as handleRight, Right } from "@/commands/editor/right";
import { Id } from "@/schema";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import * as Given from "@/test-utils/unit/given";
import * as When from "@/test-utils/unit/when";
import * as Then from "@/test-utils/unit/then";
import {
  setupCommandTest,
  type CommandRuntime,
  type EditorTestHandle,
} from "@/test-utils/unit/setup";

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

describe("editor:left command", () => {
  it("moves to previous sibling at end when at position 0", async () => {
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

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: secondChildBlockId });
      yield* Given.CURSOR_AT_START(editor);

      yield* When.EVENT_OCCURS(handleLeft(new Left()));

      yield* Then.SELECTION_ON_BLOCK(firstChildBlockId, 5);
    }).pipe(runtime.runPromise);
  });

  it("moves to deepest visible child of previous sibling when it has children", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

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

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: secondChildBlockId });
      yield* Given.CURSOR_AT_START(editor);

      yield* When.EVENT_OCCURS(handleLeft(new Left()));

      yield* Then.SELECTION_ON_BLOCK(nestedChildBlockId, 6);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent when at first sibling", async () => {
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

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: childBlockId });
      yield* Given.CURSOR_AT_START(editor);

      yield* When.EVENT_OCCURS(handleLeft(new Left()));

      yield* Then.SELECTION_ON_BLOCK(parentBlockId, 6);
    }).pipe(runtime.runPromise);
  });

  it("moves to title when at first block in document", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
        ]);

      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: firstBlockId });
      yield* Given.CURSOR_AT_START(editor);

      yield* When.EVENT_OCCURS(handleLeft(new Left()));

      yield* Then.SELECTION_ON_TITLE(bufferId, rootNodeId, 14);
    }).pipe(runtime.runPromise);
  });

  it("skips hidden children when previous sibling is collapsed", async () => {
    await Effect.gen(function* () {
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
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);
      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

      yield* Given.BLOCK_IS_COLLAPSED(firstBlockId);
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: secondBlockId });
      yield* Given.CURSOR_AT_START(editor);

      yield* When.EVENT_OCCURS(handleLeft(new Left()));

      yield* Then.SELECTION_NOT_ON_BLOCK(nestedBlockId);
      yield* Then.SELECTION_ON_BLOCK(firstBlockId, 5);
    }).pipe(runtime.runPromise);
  });

  it("calls moveLeft when cursor is not at start (no navigation)", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hello" }],
      );

      const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: blockId });
      yield* Given.CURSOR_NOT_AT_START(editor);
      yield* Given.MOVE_TRACKING_RESET(editor);

      yield* When.EVENT_OCCURS(handleLeft(new Left()));

      yield* Then.MOVE_LEFT_WAS_CALLED(editor);
    }).pipe(runtime.runPromise);
  });
});

describe("editor:right command", () => {
  it("moves to next sibling at start when at end of text", async () => {
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

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: firstChildBlockId });
      yield* Given.CURSOR_AT_END(editor);

      yield* When.EVENT_OCCURS(handleRight(new Right()));

      yield* Then.SELECTION_ON_BLOCK(secondChildBlockId, 0);
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

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: parentBlockId });
      yield* Given.CURSOR_AT_END(editor);

      yield* When.EVENT_OCCURS(handleRight(new Right()));

      yield* Then.SELECTION_ON_BLOCK(childBlockId, 0);
    }).pipe(runtime.runPromise);
  });

  it("moves to parent's next sibling when last child", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "First" }, { text: "Second" }],
      );

      const nestedId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childNodeIds[0],
        insert: "after",
        text: "Nested",
      });

      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedId);
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: nestedBlockId });
      yield* Given.CURSOR_AT_END(editor);

      yield* When.EVENT_OCCURS(handleRight(new Right()));

      yield* Then.SELECTION_ON_BLOCK(secondBlockId, 0);
    }).pipe(runtime.runPromise);
  });

  it("moves from title to first block", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Document Title", [
          { text: "First block" },
        ]);

      const titleBlockId = Id.makeBufferBlockId(bufferId, rootNodeId);
      const firstBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: titleBlockId });
      yield* Given.CURSOR_AT_END(editor);

      yield* When.EVENT_OCCURS(handleRight(new Right()));

      yield* Then.SELECTION_ON_BLOCK(firstBlockId, 0);
    }).pipe(runtime.runPromise);
  });

  it("skips hidden children when current block is collapsed", async () => {
    await Effect.gen(function* () {
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
      const secondBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[1]);
      const nestedBlockId = Id.makeBufferBlockId(bufferId, nestedChildId);

      yield* Given.BLOCK_IS_COLLAPSED(firstBlockId);
      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: firstBlockId });
      yield* Given.CURSOR_AT_END(editor);

      yield* When.EVENT_OCCURS(handleRight(new Right()));

      yield* Then.SELECTION_NOT_ON_BLOCK(nestedBlockId);
      yield* Then.SELECTION_ON_BLOCK(secondBlockId, 0);
    }).pipe(runtime.runPromise);
  });

  it("calls moveRight when cursor is not at end (no navigation)", async () => {
    await Effect.gen(function* () {
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root node",
        [{ text: "Hello" }],
      );

      const blockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      yield* Given.ACTIVE_ELEMENT_IS({ type: "block", id: blockId });
      yield* Given.CURSOR_NOT_AT_END(editor);
      yield* Given.MOVE_TRACKING_RESET(editor);

      yield* When.EVENT_OCCURS(handleRight(new Right()));

      yield* Then.MOVE_RIGHT_WAS_CALLED(editor);
    }).pipe(runtime.runPromise);
  });
});
