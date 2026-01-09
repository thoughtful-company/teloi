import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Enter key", () => {
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

  it("splits text when Enter pressed in middle of text", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);
      yield* When.USER_PRESSES("{Enter}");

      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "First");
      yield* Then.NODE_HAS_TEXT(children[1]!, " child");

      yield* Then.SELECTION_IS_NOT_ON_BLOCK(firstChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("creates new empty sibling when Enter pressed at end of text", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_PRESSES("{Enter}");

      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
      yield* Then.SELECTION_IS_NOT_ON_BLOCK(firstChildBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("creates new empty sibling above when Enter pressed at start of non-empty text", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
        ]);

      const originalBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(originalBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Enter}");

      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "First child");

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "");
      yield* Then.NODE_HAS_TEXT(children[1]!, "First child");

      yield* Then.SELECTION_IS_NOT_ON_BLOCK(originalBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  it("creates new empty sibling below when Enter pressed in empty block", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [{ text: "" }]);

      const emptyBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(emptyBlockId);
      yield* When.USER_PRESSES("{Enter}");

      yield* Then.BLOCK_COUNT_IS(2);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      yield* Then.NODE_HAS_TEXT(childNodeIds[0], "");

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "");
      yield* Then.NODE_HAS_TEXT(children[1]!, "");

      yield* Then.SELECTION_IS_NOT_ON_BLOCK(emptyBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });
});

describe("Title Enter key", () => {
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

  // Document structure:
  // Title: "Document Title" (no children yet)
  //
  // Expected after Enter:
  // Title: "Document Title"
  // └─ Block: "" (new first child, cursor here)

  it("creates first child block when Enter pressed at end of title", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with only a title (root node has no children)
      const { bufferId, nodeId: rootNodeId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks title and presses Enter (cursor at end by default)
      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_PRESSES("{Enter}");

      // Then: A new child block should be created
      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // And: The new block should be empty, title unchanged
      yield* Then.NODE_HAS_TEXT(rootNodeId, "Document Title");
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      expect(children.length).toBe(1);
      yield* Then.NODE_HAS_TEXT(children[0]!, "");

      // And: Cursor should be in the new block at position 0
      const newBlockId = Id.makeBlockId(bufferId, children[0]!);
      yield* Then.SELECTION_IS_ON_BLOCK(newBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  // Document structure:
  // Title: "Document Title" with cursor at start
  //
  // Expected after Enter:
  // Title: "" (all content moved)
  // └─ Block: "Document Title" (gets all the text, cursor here)

  it("moves all content to first block when Enter pressed at start of title", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a title
      const { bufferId, nodeId: rootNodeId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks title, moves to start, and presses Enter
      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Enter}");

      // Then: A new child block should be created
      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // And: Title should be empty, new block has all the text
      yield* Then.NODE_HAS_TEXT(rootNodeId, "");
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "Document Title");

      // And: Cursor should be in the new block at position 0
      const newBlockId = Id.makeBlockId(bufferId, children[0]!);
      yield* Then.SELECTION_IS_ON_BLOCK(newBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });

  // Document structure:
  // Title: "Document Title" with cursor at position 8 ("Document| Title")
  //
  // Expected after Enter:
  // Title: "Document" (text before cursor)
  // └─ Block: " Title" (text after cursor, cursor at start)

  it("splits title text when Enter pressed in middle", async () => {
    await Effect.gen(function* () {
      // Given: A buffer with a title
      const { bufferId, nodeId: rootNodeId } =
        yield* Given.A_BUFFER_WITH_TEXT("Document Title");

      render(() => <EditorBuffer bufferId={bufferId} />);

      // When: User clicks title, moves to position 8, and presses Enter
      yield* When.USER_CLICKS_TITLE(bufferId);
      yield* When.USER_MOVES_CURSOR_TO(8); // "Document|" Title"
      yield* When.USER_PRESSES("{Enter}");

      // Then: A new child block should be created
      yield* Then.BLOCK_COUNT_IS(1);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // And: Title should have text before cursor, new block has text after
      yield* Then.NODE_HAS_TEXT(rootNodeId, "Document");
      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, " Title");

      // And: Cursor should be in the new block at position 0
      const newBlockId = Id.makeBlockId(bufferId, children[0]!);
      yield* Then.SELECTION_IS_ON_BLOCK(newBlockId);
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(0);
    }).pipe(runtime.runPromise);
  });
});
