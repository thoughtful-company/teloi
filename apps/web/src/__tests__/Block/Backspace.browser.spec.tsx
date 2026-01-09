import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
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

describe("Block Backspace key", () => {
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

  /**
   * - A
   *   - B
   * - |C     <- cursor at start
   *
   * After Backspace, should merge with visually previous block (B):
   * - A
   *   - BC   <- cursor after "B"
   */
  it("merges with last descendant of previous sibling when it has children", async () => {
    await Effect.gen(function* () {
      // Create base structure: root with children A and C
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "A" },
          { text: "C" },
        ]);

      const [nodeA, nodeC] = childNodeIds;

      // Add child B to node A
      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });

      const blockC = Id.makeBlockId(bufferId, nodeC);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(blockC);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Backspace}");

      // Should have 1 top-level child now (A only, C merged into B)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // A should still have child B (now with merged text)
      yield* Then.NODE_HAS_CHILDREN(nodeA, 1);
      yield* Then.NODE_HAS_TEXT(nodeA, "A");

      // B should have merged text "BC"
      yield* Then.NODE_HAS_TEXT(nodeB, "BC");

      // Cursor should be at merge point (after "B")
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(1);
    }).pipe(runtime.runPromise);
  });

  /**
   * - Parent
   *   - |FirstChild   <- cursor at start, first sibling
   *
   * After Backspace, should merge into parent:
   * - ParentFirstChild   <- cursor after "Parent"
   */
  it("merges first child into parent when Backspace pressed at start", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Parent", [{ text: "FirstChild" }]);

      const [firstChildId] = childNodeIds;
      const firstChildBlockId = Id.makeBlockId(bufferId, firstChildId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(0);
      yield* When.USER_PRESSES("{Backspace}");

      // Parent should now have no children (first child merged into it)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);

      // Parent should have merged text
      yield* Then.NODE_HAS_TEXT(rootNodeId, "ParentFirstChild");

      // Cursor should be at merge point (after "Parent")
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
    }).pipe(runtime.runPromise);
  });
});
