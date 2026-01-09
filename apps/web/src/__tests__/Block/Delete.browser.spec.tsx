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

describe("Block Delete key", () => {
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

  /**
   * - Parent|     <- cursor at end
   *   - FirstChild
   *
   * After Delete, should merge with first child:
   * - ParentFirstChild   <- cursor after "Parent"
   */
  it("merges with first child when Delete pressed at end of parent", async () => {
    await Effect.gen(function* () {
      // Create root with one child "Parent"
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [{ text: "Parent" }],
      );

      const [parentNodeId] = childNodeIds;

      // Add child "FirstChild" to Parent
      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "FirstChild",
      });

      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_MOVES_CURSOR_TO(6); // "Parent" has 6 characters
      yield* When.USER_PRESSES("{Delete}");

      // Parent should now have no children (first child merged into it)
      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 0);

      // Parent should have merged text
      yield* Then.NODE_HAS_TEXT(parentNodeId, "ParentFirstChild");

      // Cursor should be at merge point (after "Parent")
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
    }).pipe(runtime.runPromise);
  });

  /**
   * - A
   *   - B|   <- cursor at end
   * - C
   *
   * After Delete, should merge with parent's next sibling:
   * - A
   *   - BC   <- cursor after "B"
   */
  it("merges with parent's next sibling when Delete pressed at end of last child", async () => {
    await Effect.gen(function* () {
      // Create base structure: root with children A and C
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "A" },
          { text: "C" },
        ]);

      const [nodeA] = childNodeIds;

      // Add child B to node A
      const nodeB = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });

      const blockB = Id.makeBlockId(bufferId, nodeB);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(blockB);
      yield* When.USER_MOVES_CURSOR_TO(1); // "B" has 1 character
      yield* When.USER_PRESSES("{Delete}");

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
});
