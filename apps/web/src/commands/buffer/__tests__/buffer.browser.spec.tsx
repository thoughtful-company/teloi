import "@/index.css";
import { Id } from "@/schema";
import { NodeT } from "@/services/domain/Node";
import BufferView from "@/ui/BufferView";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "@/test-utils/bdd";

describe("Buffer indent/outdent (Tab key)", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup!) await cleanup();
    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("indents block to become child of previous sibling when Tab pressed", async () => {
    await Effect.gen(function* () {
      // Setup: root with two children
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <BufferView bufferId={bufferId} />);

      // Focus second child and press Tab
      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
      yield* When.USER_PRESSES("{Tab}");

      // Root should now have only one child (the first one)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // First child should now have one child (the second one, which was indented)
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Verify the indented node is now child of first sibling
      const Node = yield* NodeT;
      const firstChildChildren = yield* Node.getNodeChildren(childNodeIds[0]);
      yield* Then.NODE_HAS_TEXT(firstChildChildren[0]!, "Second child");
    }).pipe(runtime.runPromise);
  });

  it("indents block when text is selected", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <BufferView bufferId={bufferId} />);

      // Focus second child, select some text, then press Tab
      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
      yield* When.USER_PRESSES("{Shift>}{End}{/Shift}"); // Select all text
      yield* When.USER_PRESSES("{Tab}");

      // Should still indent despite having selection
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      // Text should be preserved (not replaced by tab character)
      yield* Then.NODE_HAS_TEXT(childNodeIds[1], "Second child");
    }).pipe(runtime.runPromise);
  });

  it("preserves cursor position after indentation", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <BufferView bufferId={bufferId} />);

      // Focus second child, move cursor to position 7 ("Second |child")
      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 7);
      yield* When.USER_PRESSES("{Tab}");

      // Should indent
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Cursor should still be at position 7
      yield* Then.SELECTION_IS_COLLAPSED_AT_OFFSET(7);
    }).pipe(runtime.runPromise);
  });

  it("dedents block to become sibling of parent when Shift+Tab pressed", async () => {
    await Effect.gen(function* () {
      const { bufferId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_CHILDREN("Root node", [
          { text: "First child" },
          { text: "Second child" },
        ]);

      const secondChildBlockId = Id.makeBufferBlockId(
        bufferId,
        childNodeIds[1],
      );

      render(() => <BufferView bufferId={bufferId} />);

      yield* Given.BLOCK_IS_FOCUSED_AT(secondChildBlockId, 0);
      yield* When.USER_PRESSES("{Tab}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 1);

      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 2);
      yield* Then.NODE_HAS_CHILDREN(childNodeIds[0], 0);

      const Node = yield* NodeT;
      const rootChildren = yield* Node.getNodeChildren(rootNodeId);
      yield* Then.NODE_HAS_TEXT(rootChildren[0]!, "First child");
      yield* Then.NODE_HAS_TEXT(rootChildren[1]!, "Second child");
    }).pipe(runtime.runPromise);
  });

  it("Shift+Tab is no-op on first-level block when buffer root has a parent", async () => {
    await Effect.gen(function* () {
      // Structure:
      // - Grandparent (not visible in buffer)
      //   - BufferRoot (buffer's assignedNodeId)
      //     - Child  <- First-level block, Shift+Tab should be no-op
      const { bufferId, parentNodeId, rootNodeId, childNodeIds } =
        yield* Given.A_BUFFER_WITH_PARENT_AND_CHILDREN(
          "Grandparent",
          "Buffer Root",
          [{ text: "Child" }],
        );

      const childBlockId = Id.makeBufferBlockId(bufferId, childNodeIds[0]);

      render(() => <BufferView bufferId={bufferId} />);

      // Focus child and press Shift+Tab
      yield* Given.BLOCK_IS_FOCUSED_AT(childBlockId, 0);
      yield* When.USER_PRESSES("{Shift>}{Tab}{/Shift}");

      // Child should STILL be under buffer root (no-op, not moved to grandparent)
      yield* Then.NODE_HAS_CHILDREN(rootNodeId, 1);

      // Verify child's parent is still buffer root
      const Node = yield* NodeT;
      const childParent = yield* Node.getParent(childNodeIds[0]);
      expect(childParent).toBe(rootNodeId);

      // Grandparent should still have only one child (buffer root)
      yield* Then.NODE_HAS_CHILDREN(parentNodeId, 1);
    }).pipe(runtime.runPromise);
  });
});
