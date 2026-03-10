import "@/index.css";
import { Id } from "@/schema";
import { AutomergeT } from "@/services/external/Automerge";
import { KhoraT } from "@/services/ui/Khora";
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

describe("MergeForward (Delete at end of block)", () => {
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

  it("merges next flat sibling into current block", async () => {
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

      const [nodeA] = childNodeIds;
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(blockA, 5);
      yield* When.USER_PRESSES("{Delete}");

      yield* Then.NODE_HAS_TEXT(nodeA, "Hello World");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.CM_CURSOR_IS_AT(5);
    }).pipe(runtime.runPromise);
  });

  it("merges first expanded child when block has visible children", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Parent")
      //       - A1("Child")
      const { frameId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Parent" }]);

      const [nodeA] = childNodeIds;
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child",
      });

      render(() => <FrameView frameId={frameId} />);

      // A is expanded by default, so the block below A is A1
      yield* Given.KHORA_IS_FOCUSED_AT(blockA, 6);
      yield* When.USER_PRESSES("{Delete}");

      yield* Then.NODE_HAS_TEXT(nodeA, "ParentChild");
      yield* Then.NODE_HAS_CHILDREN(nodeA, 0);
      yield* Then.CM_CURSOR_IS_AT(6);
    }).pipe(runtime.runPromise);
  });

  it("does nothing when target has children (would orphan them)", async () => {
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
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeB,
        insert: "after",
        text: "Nested",
      });

      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(blockA, 5);
      yield* When.USER_PRESSES("{Delete}");

      // Nothing should change
      yield* Then.NODE_HAS_TEXT(nodeA, "Hello");
      yield* Then.NODE_HAS_TEXT(nodeB, "World");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
    }).pipe(runtime.runPromise);
  });

  it("does nothing at the last block in tree", async () => {
    await Effect.gen(function* () {
      // Structure:
      //   Root
      //     - A("Only")
      const { frameId, rootNodeId, childNodeIds } =
        yield* Given.A_FRAME_WITH_CHILDREN("Root", [{ text: "Only" }]);

      const [nodeA] = childNodeIds;
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(blockA, 4);
      yield* When.USER_PRESSES("{Delete}");

      // Nothing should change
      yield* Then.NODE_HAS_TEXT(nodeA, "Only");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
    }).pipe(runtime.runPromise);
  });

  it("merges next sibling instead of first child when block is collapsed", async () => {
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

      const [nodeA] = childNodeIds;
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);

      yield* Given.INSERT_NODE_WITH_TEXT({
        parentId: nodeA,
        insert: "after",
        text: "Child",
      });

      // Collapse A so its children are hidden
      const Khora = yield* KhoraT;
      yield* Khora.setExpanded(blockA, false);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(blockA, 6);
      yield* When.USER_PRESSES("{Delete}");

      // A merged B (not A1), because A is collapsed
      yield* Then.NODE_HAS_TEXT(nodeA, "ParentSibling");
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.CM_CURSOR_IS_AT(6);
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
      const blockA = Id.makeFrameKhoraId(frameId, nodeA);

      render(() => <FrameView frameId={frameId} />);

      yield* Given.KHORA_IS_FOCUSED_AT(blockA, 5);
      yield* When.USER_PRESSES("{Delete}");

      // Merged text lives in A
      yield* Then.NODE_HAS_TEXT(nodeA, "Hello World");

      // B's Automerge text should be cleaned up
      const Automerge = yield* AutomergeT;
      const deletedText = yield* Automerge.getText(nodeB);
      expect(deletedText).toBe("");
    }).pipe(runtime.runPromise);
  });
});
