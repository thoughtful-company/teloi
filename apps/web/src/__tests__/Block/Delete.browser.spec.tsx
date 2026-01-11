import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { BlockT } from "@/services/ui/Block";
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
   * - Parent|     <- cursor at end (expanded)
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

      // Expand parent so its children are visible for merge target
      const Block = yield* BlockT;
      yield* Block.setExpanded(parentBlockId, true);

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
   *   - B|   <- cursor at end, last child of A
   * - C
   *
   * Delete at last child should NOT cross hierarchy - it's a no-op.
   * Structure stays the same, cursor stays at position 1.
   */
  it("does nothing when Delete pressed at end of last child (no hierarchy crossing)", async () => {
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

      const blockA = Id.makeBlockId(bufferId, nodeA);
      const blockB = Id.makeBlockId(bufferId, nodeB);

      render(() => <EditorBuffer bufferId={bufferId} />);

      // Expand A so B is visible
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, true);

      yield* When.USER_CLICKS_BLOCK(blockB);
      yield* When.USER_MOVES_CURSOR_TO(1); // "B" has 1 character
      yield* When.USER_PRESSES("{Delete}");

      // Structure should be UNCHANGED - no hierarchy crossing
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2); // A and C still both exist
      yield* Then.NODE_HAS_CHILDREN(nodeA, 1); // B is still the only child
      yield* Then.NODE_HAS_TEXT(nodeA, "A");
      yield* Then.NODE_HAS_TEXT(nodeB, "B");
      yield* Then.NODE_HAS_TEXT(nodeC, "C");

      // Cursor should stay at position 1
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(1);
    }).pipe(runtime.runPromise);
  });

it("merges with next sibling when Cmd+Delete pressed at end", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First" },
          { text: "Second" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);
      yield* When.USER_PRESSES("{Meta>}{Delete}{/Meta}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  it("merges with next sibling when Alt+Delete pressed at end", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First" },
          { text: "Second" },
        ]);

      const firstChildBlockId = Id.makeBlockId(bufferId, childNodeIds[0]);
      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstChildBlockId);
      yield* When.USER_MOVES_CURSOR_TO(5);
      yield* When.USER_PRESSES("{Alt>}{Delete}{/Alt}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      const Node = yield* NodeT;
      const children = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(children[0]!, "FirstSecond");
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure:
   * Root
   * ├── First (collapsed, with child Hidden)
   * │   └── Hidden (NOT visible)
   * └── Second
   *
   * Cursor at end of First, press Delete.
   * Should merge Second (NOT Hidden which is collapsed).
   */
  it("merges next sibling when collapsed with children", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First" },
          { text: "Second" },
        ]);

      const [firstNodeId] = childNodeIds;

      const hiddenChildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: firstNodeId,
        insert: "after",
        text: "Hidden",
      });

      const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

      const Block = yield* BlockT;
      yield* Block.setExpanded(firstBlockId, false);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{Delete}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_TEXT(firstNodeId, "FirstSecond");
      yield* Then.NODE_HAS_CHILDREN(firstNodeId, 1);
      yield* Then.NODE_HAS_TEXT(hiddenChildId, "Hidden");
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure:
   * Root
   * └── Parent (expanded, with child that has grandchildren)
   *     └── Child
   *         └── Grandchild
   *
   * Cursor at end of Parent, press Delete.
   * Should be no-op because merging Child would orphan Grandchild.
   */
  it("no-op when first child has grandchildren (would orphan them)", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [{ text: "Parent" }]);

      const [parentNodeId] = childNodeIds;

      const childId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: parentNodeId,
        insert: "after",
        text: "Child",
      });

      const grandchildId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: childId,
        insert: "after",
        text: "Grandchild",
      });

      const parentBlockId = Id.makeBlockId(bufferId, parentNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(parentBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{Delete}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_TEXT(parentNodeId, "Parent");
      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 1);
      yield* Then.NODE_HAS_TEXT(childId, "Child");
      yield* Then.NODE_HAS_CHILDREN(childId, 1);
      yield* Then.NODE_HAS_TEXT(grandchildId, "Grandchild");
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(6);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure:
   * Root
   * ├── First|        <- cursor at end
   * └── Second
   *     └── Nephew
   *
   * Cursor at end of First, press Delete.
   * Should be no-op because merging Second would orphan Nephew.
   */
  it("no-op when next sibling has children (would orphan nieces/nephews)", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First" },
          { text: "Second" },
        ]);

      const [firstNodeId, secondNodeId] = childNodeIds;

      const nephewId = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: secondNodeId,
        insert: "after",
        text: "Nephew",
      });

      const firstBlockId = Id.makeBlockId(bufferId, firstNodeId);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* When.USER_CLICKS_BLOCK(firstBlockId);
      yield* When.USER_PRESSES("{End}");
      yield* When.USER_PRESSES("{Delete}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
      yield* Then.NODE_HAS_TEXT(firstNodeId, "First");
      yield* Then.NODE_HAS_TEXT(secondNodeId, "Second");
      yield* Then.NODE_HAS_CHILDREN(secondNodeId, 1);
      yield* Then.NODE_HAS_TEXT(nephewId, "Nephew");
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(5);
    }).pipe(runtime.runPromise);
  });
});
