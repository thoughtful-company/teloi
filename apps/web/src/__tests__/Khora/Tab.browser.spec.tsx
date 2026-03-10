import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import { KhoraT } from "@/services/ui/Khora";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Khora selection Tab key", () => {
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

  it("Tab indents all selected blocks under previous sibling (grouped)", async () => {
    await Effect.gen(function* () {
      // Given: root with 3 children A, B, C at same level
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      render(() => <FrameView frameId={frameId} />);

      // Select B and extend selection to C
      const blockB = Id.makeFrameKhoraId(frameId, childNodeIds[1]);
      yield* When.USER_ENTERS_KHORA_SELECTION(blockB);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify B and C are selected
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [
        childNodeIds[1],
        childNodeIds[2],
      ]);

      // When: User presses Tab
      yield* When.USER_PRESSES("{Tab}");

      // Then: Root should have only A, and A should have B and C as children
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 2);

      // Verify B and C are now children of A
      const Node = yield* NodeT;
      const aChildren = yield* Node.getNodeChildren(childNodeIds[0]);
      yield* Then.NODE_HAS_TEXT(aChildren[0]!, "B");
      yield* Then.NODE_HAS_TEXT(aChildren[1]!, "C");

      // Selection should be preserved
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [
        childNodeIds[1],
        childNodeIds[2],
      ]);
    }).pipe(runtime.runPromise);
  });

  it("Shift+Tab outdents all selected blocks to parent's level", async () => {
    await Effect.gen(function* () {
      // Given: root with 3 children A, B, C - we'll indent B,C first, then outdent
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
          { text: "C" },
        ]);

      render(() => <FrameView frameId={frameId} />);

      // First, indent B and C under A (setup for outdent test)
      const blockB = Id.makeFrameKhoraId(frameId, childNodeIds[1]);
      yield* When.USER_ENTERS_KHORA_SELECTION(blockB);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Tab}");

      // Verify B and C are now children of A
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 2);

      // Now outdent: B and C are still selected, press Shift+Tab
      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      // Then: A should have no children, root should have A, B, C as children again
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 0);
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 3);

      // Verify order: A, B, C (B and C moved after A)
      const Node = yield* NodeT;
      const rootChildren = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(rootChildren[0]!, "A");
      yield* Then.NODE_HAS_TEXT(rootChildren[1]!, "B");
      yield* Then.NODE_HAS_TEXT(rootChildren[2]!, "C");
    }).pipe(runtime.runPromise);
  });

  it("Tab does nothing when first selected block has no previous sibling", async () => {
    await Effect.gen(function* () {
      // Given: root with 2 children A, B
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "A" },
          { text: "B" },
        ]);

      render(() => <FrameView frameId={frameId} />);

      // Select A (first child) and extend to B
      const blockA = Id.makeFrameKhoraId(frameId, childNodeIds[0]);
      yield* When.USER_ENTERS_KHORA_SELECTION(blockA);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");

      // Verify A and B are selected
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [
        childNodeIds[0],
        childNodeIds[1],
      ]);

      // When: User presses Tab (should do nothing - A is first child)
      yield* When.USER_PRESSES("{Tab}");

      // Then: Structure unchanged - root still has both children
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);

      // Selection should be preserved
      yield* Then.BLOCKS_ARE_SELECTED(frameId, [
        childNodeIds[0],
        childNodeIds[1],
      ]);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure before:
   * - Root
   *   - A (collapsed, has child B)
   *     - B
   *   - C
   *
   * User focuses C and presses Tab to indent.
   * A auto-expands after Tab so C remains visible.
   */
  it("auto-expands collapsed parent when indenting single block", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "C" }],
      );

      const [nodeA, nodeC] = childNodeIds;

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });

      const blockA = Id.makeFrameKhoraId(frameId, nodeA);
      const blockC = Id.makeFrameKhoraId(frameId, nodeC);

      render(() => <FrameView frameId={frameId} />);

      const Khora = yield* KhoraT;
      yield* Khora.setExpanded(blockA, false);
      yield* Then.KHORA_IS_COLLAPSED(blockA);

      yield* Given.KHORA_IS_FOCUSED_AT(blockC, 0);
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(nodeA, 2);
      yield* Then.KHORA_IS_EXPANDED(blockA);
    }).pipe(runtime.runPromise);
  });

  /**
   * Structure before:
   * - Root
   *   - A (collapsed, has child B)
   *     - B
   *   - C
   *   - D
   *
   * User selects C and D in khora selection mode, presses Tab.
   * A auto-expands so C and D remain visible.
   */
  it("auto-expands collapsed parent when indenting selected blocks", async () => {
    await Effect.gen(function* () {
      const { frameId, childNodeIds } = yield* Given.A_FRAME_WITH_CHILDREN(
        "Root",
        [{ text: "A" }, { text: "C" }, { text: "D" }],
      );

      const [nodeA, nodeC] = childNodeIds;

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "B",
      });

      const blockA = Id.makeFrameKhoraId(frameId, nodeA);
      const blockC = Id.makeFrameKhoraId(frameId, nodeC);

      render(() => <FrameView frameId={frameId} />);

      const Khora = yield* KhoraT;
      yield* Khora.setExpanded(blockA, false);
      yield* Then.KHORA_IS_COLLAPSED(blockA);

      yield* When.USER_ENTERS_KHORA_SELECTION(blockC);
      yield* When.USER_PRESSES("{Shift>}{ArrowDown}{/Shift}");
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(nodeA, 3);
      yield* Then.KHORA_IS_EXPANDED(blockA);
    }).pipe(runtime.runPromise);
  });
});
