import "@/index.css";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { BlockT } from "@/services/ui/Block";
import FrameView from "@/ui/FrameView";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("MergeBackward (Backspace at start of block)", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    await cleanup?.();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("merges current block into previous flat sibling", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Hello")
      //     - B(" World")
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Hello" },
          { text: " World" },
        ]);

      const [nodeA, nodeB] = childNodeIds;
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockB, 0);
      yield* When.USER_PRESSES("{Backspace}");

      yield* Then.NODE_HAS_TEXT(nodeA, "Hello World");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.CM_CURSOR_IS_AT(5);
    }).pipe(runtime.runPromise);
  });

  it("does nothing when current block has children (would orphan them)", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Hello")
      //     - B("World")
      //       - B1("Nested")
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Hello" },
          { text: "World" },
        ]);

      const [nodeA, nodeB] = childNodeIds;
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Nested",
      });

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockB, 0);
      yield* When.USER_PRESSES("{Backspace}");

      // Nothing should change
      yield* Then.NODE_HAS_TEXT(nodeA, "Hello");
      yield* Then.NODE_HAS_TEXT(nodeB, "World");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
    }).pipe(runtime.runPromise);
  });

  it("merges first block into the title", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root("Title")
      //     - A("Only")
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Title", [{ text: "Only" }]);

      const [nodeA] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockA, 0);
      yield* When.USER_PRESSES("{Backspace}");

      // A merged into the title (block above first child is the root)
      yield* Then.NODE_HAS_TEXT(rootNodeId, "TitleOnly");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 0);
    }).pipe(runtime.runPromise);
  });

  it("merges into collapsed previous sibling (not its hidden children)", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Parent") [COLLAPSED]
      //       - A1("Child")
      //     - B("Sibling")
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Parent" },
          { text: "Sibling" },
        ]);

      const [nodeA, nodeB] = childNodeIds;
      const blockA = Id.makeFrameBlockId(frameId, nodeA);
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child",
      });

      // Collapse A so its children are hidden
      const Block = yield* BlockT;
      yield* Block.setExpanded(blockA, false);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockB, 0);
      yield* When.USER_PRESSES("{Backspace}");

      // B merged into A (the collapsed block above), not A1
      yield* Then.NODE_HAS_TEXT(nodeA, "ParentSibling");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.CM_CURSOR_IS_AT(6);
    }).pipe(runtime.runPromise);
  });

  it("merges into last visible child of expanded previous sibling", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Parent") [EXPANDED]
      //       - A1("Child")
      //     - B("Sibling")
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Parent" },
          { text: "Sibling" },
        ]);

      const [nodeA, nodeB] = childNodeIds;
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      const nodeA1 = yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child",
      });

      render(() => <FrameView frameId={frameId} />);

      // A is expanded by default, so the block above B is A1 (not A)
      yield* Given.BLOCK_IS_FOCUSED_AT(blockB, 0);
      yield* When.USER_PRESSES("{Backspace}");

      // B merged into A1 (the visible block directly above)
      yield* Then.NODE_HAS_TEXT(nodeA1, "ChildSibling");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.CM_CURSOR_IS_AT(5);
    }).pipe(runtime.runPromise);
  });

  it("cleans up Automerge text for the deleted node", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Hello")
      //     - B(" World")
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [
          { text: "Hello" },
          { text: " World" },
        ]);

      const [nodeA, nodeB] = childNodeIds;
      const blockB = Id.makeFrameBlockId(frameId, nodeB);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(blockB, 0);
      yield* When.USER_PRESSES("{Backspace}");

      // Merged text lives in A
      yield* Then.NODE_HAS_TEXT(nodeA, "Hello World");

      // B's Automerge text should be cleaned up
      const Automerge = yield* AutomergeT;
      const deletedText = yield* Automerge.getText(nodeB);
      expect(deletedText).toBe("");
    }).pipe(runtime.runPromise);
  });
});
